const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { install, Browser, resolveBuildId, detectBrowserPlatform } = require('@puppeteer/browsers');

// Caminho para salvar cookies (sessão)
const COOKIES_PATH = path.join(__dirname, '../../linkedin_cookies.json');
// Caminho LOCAL para cache do navegador (dentro do projeto para garantir acesso)
const BROWSER_CACHE_DIR = path.join(process.cwd(), '.cache', 'puppeteer');

// Função para garantir que o Chrome exista localmente
async function ensureBrowserInstalled() {
    console.log(`🕵️ Verificando instalação do Chrome em: ${BROWSER_CACHE_DIR}`);

    // Tenta detectar plataforma. Se falhar (ex: windows sem wsl), assume win64
    let platform = detectBrowserPlatform();
    if (!platform) {
        console.warn("⚠️ Plataforma não detectada automaticamente. Assumindo win64 ou linux.");
        platform = process.platform === 'win32' ? 'win64' : 'linux';
    }

    // FIX: Usar versão fixa do Chrome for Testing Known Good Version para evitar erros de resolução dinâmica da API do Google
    // Versão 119.0.6045.105 é estável e amplamente compatível
    const buildId = '119.0.6045.105';

    console.log(`⬇️ Verificando/Baixando Chrome (${platform} - ${buildId})...`);

    // Instala/Verifica
    const browserInfo = await install({
        browser: Browser.CHROME,
        buildId: buildId,
        cacheDir: BROWSER_CACHE_DIR,
        unpack: true
    });

    console.log(`✅ Chrome pronto em: ${browserInfo.executablePath}`);
    return browserInfo.executablePath;
}

// Função principal do Scraper
async function scrapeLinkedInComments(db, postsToScan = [], options = {}) {
    const { email, password, headless = false } = options;
    console.log("🚀 Iniciando RPA LinkedIn Scraper (Modo Self-Healing)...");

    let browser;
    try {
        // 1. Garante binário do Chrome
        const executablePath = await ensureBrowserInstalled();

        // 2. Lança o Puppeteer apontando para esse binário
        browser = await puppeteer.launch({
            headless: headless,
            executablePath: executablePath,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--start-maximized',
                '--disable-notifications'
            ]
        });

        const page = await browser.newPage();

        // 3. Gestão de Sessão (Cookies)
        if (fs.existsSync(COOKIES_PATH)) {
            try {
                const cookiesString = fs.readFileSync(COOKIES_PATH);
                const cookies = JSON.parse(cookiesString);
                await page.setCookie(...cookies);
                console.log("🍪 Cookies carregados.");
            } catch (err) {
                console.warn("⚠️ Erro ao ler cookies:", err.message);
            }
        }

        // 4. Navegação / Login
        // Timeout aumentado para 90s e waitUntil 'domcontentloaded' para ser mais ágil
        try {
            console.log("Variável de timeout: 90s. Aguardando Feed...");
            await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 });
        } catch (navErr) {
            console.warn("⚠️ Aviso: Navegação inicial demorou (Timeout), mas vamos tentar verificar se a página carregou.", navErr.message);
        }

        // Verifica login esperando pelo elemento (mais robusto que check imediato)
        let isLoggedIn = false;
        try {
            // Espera até 15s pelo elemento da nav bar
            await page.waitForSelector('.global-nav__content', { timeout: 15000 });
            isLoggedIn = true;
        } catch (e) { isLoggedIn = false; }

        if (!isLoggedIn) {
            console.log("⚠️ Não logado (ou seletor global-nav não encontrado).");

            if (headless) {
                console.warn("🛑 Não autenticado e rodando em modo headless.");
            }

            // Tenta ir para login page se já não estiver lá
            if (!page.url().includes('login')) {
                await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
            }

            // Se rodar local tem interface
            if (!headless) {
                console.log("⌨️ Aguardando login manual pelo usuário...");
                try {
                    await page.waitForSelector('.global-nav__content', { timeout: 120000 }); // 2 minutos para logar
                    const cookies = await page.cookies();
                    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
                    console.log("💾 Novos cookies salvos.");
                } catch (e) {
                    console.error("Tempo de login esgotado.");
                }
            } else {
                console.log("🛑 Sem interface visual. Login impossível sem cookies válidos.");
            }
        }

        let totalCommentsFound = 0;

        // 5. Scan dos Posts
        for (const post of postsToScan) {
            if (!post.linkedinPostId) continue;

            const postUrl = `https://www.linkedin.com/feed/update/${post.linkedinPostId}/`;
            console.log(`🔎 Scan: ${post.topic} (${postUrl})`);

            try {
                // Timeout maior e domcontentloaded
                await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                // Delay para carregar JS (Feed posts precisam de hidratação)
                await new Promise(r => setTimeout(r, 5000));

                // Tenta expandir comentários
                try {
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await new Promise(r => setTimeout(r, 2000));

                    const loadMoreSelectors = ['button.comments-comments-list__load-more-comments-button', 'button.scaffold-finite-scroll__load-button'];
                    for (const sel of loadMoreSelectors) {
                        const btn = await page.$(sel);
                        if (btn) await btn.click().catch(() => { });
                    }
                    await new Promise(r => setTimeout(r, 2000));
                } catch (e) { /* ignore */ }

                // Extrai dados
                const comments = await page.evaluate(() => {
                    const items = document.querySelectorAll('article.comments-comment-item');
                    const results = [];
                    items.forEach(item => {
                        try {
                            const authorEl = item.querySelector('.comments-post-meta__name-text');
                            const textEl = item.querySelector('.comments-comment-item__main-content');
                            const imgEl = item.querySelector('.comments-post-meta__profile-image');

                            if (authorEl && textEl) {
                                let authorName = authorEl.innerText.trim().split('\n')[0].trim();
                                const text = textEl.innerText.trim();
                                const avatar = imgEl ? imgEl.src : null;
                                const urn = item.getAttribute('data-id') || item.getAttribute('id') || `gen_${Math.random()}`;

                                results.push({
                                    id: urn,
                                    text: text,
                                    author: { name: authorName, imageUrl: avatar },
                                    createdAt: new Date().toISOString()
                                });
                            }
                        } catch (err) { }
                    });
                    return results;
                });

                console.log(`📥 ${comments.length} comentários extraídos.`);

                // Salva no Firestore
                if (comments.length > 0) {
                    let newCount = 0;
                    for (const c of comments) {
                        // Verifica duplicação
                        const cRef = db.collection('comments').doc(c.id);
                        const exists = (await cRef.get()).exists;
                        if (!exists) {
                            await cRef.set({
                                ...c,
                                postDbId: post.id,
                                postTopic: post.topic,
                                syncedAt: new Date(),
                                read: false,
                                replied: false,
                                source: 'rpa_puppeteer'
                            });
                            newCount++;
                        }
                    }
                    totalCommentsFound += newCount;
                    console.log(`💾 ${newCount} novos salvos.`);
                }
            } catch (err) {
                console.error(`❌ Erro no post ${post.id}:`, err.message);
            }
        }

        return { success: true, newComments: totalCommentsFound };

    } catch (error) {
        console.error("🔥 Erro Code RPA:", error);
        return { success: false, error: error.message };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { scrapeLinkedInComments };
