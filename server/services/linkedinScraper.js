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
                '--disable-notifications',
                // OTIMIZAÇÕES PARA SERVER FREE (RENDER):
                '--disable-extensions',
                '--mute-audio',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-background-networking'
            ]
        });

        const page = await browser.newPage();

        // 3. Gestão de Sessão (Cookies - Híbrido: Arquivo Local + Firestore)
        let cookiesLoaded = false;

        // A. Tenta Arquivo Local
        if (fs.existsSync(COOKIES_PATH)) {
            try {
                const cookiesString = fs.readFileSync(COOKIES_PATH);
                const cookies = JSON.parse(cookiesString);
                await page.setCookie(...cookies);
                console.log("🍪 Cookies carregados (Local File).");
                cookiesLoaded = true;
            } catch (err) { console.warn("⚠️ Erro ao ler cookies locais:", err.message); }
        }

        // B. Se não tem local, tenta Firestore (Ideal para Render/Cloud)
        if (!cookiesLoaded) {
            try {
                const doc = await db.collection('settings').doc('linkedin_cookies').get();
                if (doc.exists && doc.data().cookies) {
                    const cloudCookies = JSON.parse(doc.data().cookies);
                    await page.setCookie(...cloudCookies);
                    console.log("☁️ Cookies carregados (Firestore Cloud).");
                    cookiesLoaded = true;
                }
            } catch (err) { console.warn("⚠️ Erro ao ler cookies do Firestore:", err.message); }
        }

        // 4. Navegação / Login
        try {
            console.log("Variável de timeout: 90s. Aguardando Feed...");
            await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 90000 });
        } catch (e) {
            console.warn("⚠️ Timeout ou erro ao carregar Feed. Verificando login...", e.message);
        }

        // Verifica se realmente estamos logados
        let isLoggedIn = false;
        try {
            await page.waitForSelector('.global-nav__content', { timeout: 10000 });
            isLoggedIn = true;
        } catch (e) { isLoggedIn = false; }

        if (!isLoggedIn) {
            console.log("⚠️ Não logado (ou seletor global-nav não encontrado).");

            if (headless) {
                // FAIL-FAST: Se for Headless e não estiver logado, abortar.
                const msg = "🛑 ERRO FATAL: Modo Headless sem autenticação válida. Rode localmente para gerar cookies.";
                console.error(msg);
                await browser.close();
                return { success: false, error: msg };
            }

            // Tenta ir para login page se já não estiver lá
            if (!page.url().includes('login')) {
                await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
            }

            console.log("⌨️ Aguardando login manual pelo usuário...");
            try {
                await page.waitForSelector('.global-nav__content', { timeout: 120000 }); // 2 minutos para logar
                const cookies = await page.cookies();
                const cookiesJson = JSON.stringify(cookies, null, 2);

                // Salva Local
                fs.writeFileSync(COOKIES_PATH, cookiesJson);

                // Salva Cloud (Firestore) para o Servidor usar depois
                await db.collection('settings').doc('linkedin_cookies').set({
                    cookies: cookiesJson,
                    updatedAt: new Date()
                });

                console.log("💾 Novos cookies salvos (Local + Firestore).");
            } catch (e) {
                console.error("Tempo de login esgotado.");
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
                    await new Promise(r => setTimeout(r, 1000));

                    // 1. Tenta abrir a seção de comentários clicando no contador (ex: "1 comentário")
                    const commentCountBtn = await page.$('.social-details-social-counts__comments');
                    if (commentCountBtn) {
                        console.log("Clicando para expandir seção de comentários...");
                        await commentCountBtn.click();
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    // PAUSA PARA INVESTIGAÇÃO VISUAL (Se estiver rodando local)
                    if (!headless) {
                        // console.log("🛑 PAUSA DE DEBUG (20s) REMOVIDA.");
                    } else {
                        // Tenta botão de ação "Comentar" se a lista não estiver visível
                        const commentAction = await page.$('button[aria-label*="Comentar"]');
                        if (commentAction) {
                            await commentAction.click();
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    // 2. Carrega mais comentários se houver paginação
                    const loadMoreSelectors = [
                        'button.comments-comments-list__load-more-comments-button',
                        'button.scaffold-finite-scroll__load-button',
                        '.comments-comments-list__show-previous-button'
                    ];
                    for (const sel of loadMoreSelectors) {
                        const btn = await page.$(sel);
                        if (btn) {
                            console.log("Clicando em carregar mais...");
                            await btn.click().catch(() => { });
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }
                } catch (e) {
                    console.log("Erro na expansão de comentários:", e.message);
                }

                // --- ESTRATÉGIA DE EXTRAÇÃO DE COMENTÁRIOS ---
                const comments = await page.evaluate(() => {
                    // --- FUNÇÕES AUXILIARES ---
                    const getSafeText = (el) => el ? el.innerText.trim() : "";
                    // NOVA Versão do Fallback Inteligente (Smart Parsing)
                    const cleanBrutalText = (text) => {
                        let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        if (lines.length < 2) return null;

                        // 1. Autor: Tenta limpar sufixos (bullet, ponto, grau de conexão)
                        let authorLine = lines[0].replace(/[\.·•]\s*[123]º.*/, '').replace(/\(.*\)/, '').trim();

                        // FILTRO: Ignora se começar com "Autor" (label do LinkedIn capturado errado ou indesejado)
                        if (/^autor/i.test(authorLine)) return null;

                        // 2. Processa o resto
                        let remainingLines = lines.slice(1);
                        let cleanCommentLines = [];

                        for (let i = 0; i < remainingLines.length; i++) {
                            const line = remainingLines[i];
                            const lowerLine = line.toLowerCase();

                            // A. Ignora Linhas de Métrica/Conexão
                            if (/^[•·]\s*[123]º/.test(line) || line === '•' || line.includes('• 1º') || line.includes('• 2º')) continue;

                            // B. Ignora Título Profissional (Heurística)
                            if (line.includes('|') || line.includes('CRP') || (line.length > 30 && (line.includes(' at ') || line.includes(' em ') || line.includes('Designer') || line.includes('Engineer') || line.includes('Consultor')))) continue;

                            // C. Ignora Tempo
                            if (/^\d+\s*[hdm]\s*$/.test(line) || ['agora', 'editado', '(editado)'].includes(lowerLine)) continue;

                            // D. Ignora Rodapé
                            const junkKeywords = ['gostar', 'responder', 'ver tradução', 'carregar anteriores', '...mais', 'gostei', 'like', 'reply', 'comentários'];
                            if (junkKeywords.some(kw => lowerLine === kw || (lowerLine.includes(kw) && line.length < 25))) continue;

                            // E. Ignora números soltos
                            if (/^\d+$/.test(line)) continue;

                            cleanCommentLines.push(line);
                        }

                        const finalText = cleanCommentLines.join(' ').trim();
                        if (!finalText) return null;

                        // NOVO FILTRO: Se o texto começar com "Autor(a)", geralmente é comentário do próprio dono. Descartar.
                        if (/^autor\(a\)/i.test(finalText)) return null;

                        return { author: authorLine, text: finalText };
                    };

                    // 1. ESTRATÉGIA A: SELETORES PADRÃO
                    const possibleItemSelectors = [
                        'article.comments-comment-item',
                        '.comments-comments-list__comment-item',
                        'li.comments-comments-list__comment-item',
                        'li.comments-comment-item',
                        'div.comments-comment-item'
                    ];

                    let items = [];
                    for (const sel of possibleItemSelectors) {
                        const found = document.querySelectorAll(sel);
                        if (found.length > 0) {
                            items = Array.from(found);
                            items = items.filter(el => el.offsetHeight > 0);
                            if (items.length > 0) break;
                        }
                    }

                    // 2. ESTRATÉGIA B: SELF-HEALING REVERSO
                    if (items.length === 0) {
                        // console.log("⚠️ Seletores de classe falharam. Iniciando Self-Healing Reverso...");
                        const actionButtons = Array.from(document.querySelectorAll('button'));
                        const candidates = new Set();
                        actionButtons.forEach(btn => {
                            const txt = btn.innerText.toLowerCase();
                            const label = (btn.getAttribute('aria-label') || "").toLowerCase();
                            if (txt.includes('gostar') || txt.includes('responder') || label.includes('responder') || label.includes('like')) {
                                let parent = btn.parentElement;
                                for (let i = 0; i < 8; i++) {
                                    if (!parent) break;
                                    const tag = parent.tagName;
                                    const cls = (parent.className || "").toLowerCase();
                                    if (tag === 'ARTICLE' || tag === 'LI' || (tag === 'DIV' && cls.includes('comment-item'))) {
                                        candidates.add(parent);
                                        break;
                                    }
                                    parent = parent.parentElement;
                                }
                            }
                        });
                        if (candidates.size > 0) items = Array.from(candidates);
                    }

                    const results = [];
                    items.forEach(item => {
                        try {
                            const authorEl = item.querySelector('.comments-post-meta__name-text') || item.querySelector('.comments-post-meta__name') || item.querySelector('span.hoverable-link-text') || item.querySelector('a.app-aware-link');
                            const textEl = item.querySelector('.comments-comment-item__main-content') || item.querySelector('.feed-shared-main-content--comment') || item.querySelector('.update-components-text') || item.querySelector('span[dir="ltr"]');
                            const imgEl = item.querySelector('.comments-post-meta__profile-image') || item.querySelector('img');

                            const urn = item.getAttribute('data-id') || item.getAttribute('data-urn') || item.getAttribute('id') || `gen_${Math.random().toString(36).substr(2, 9)}`;

                            if (authorEl && textEl) {
                                results.push({
                                    id: urn,
                                    text: getSafeText(textEl),
                                    author: { name: getSafeText(authorEl).split('\n')[0].trim(), imageUrl: imgEl ? imgEl.src : null },
                                    createdAt: new Date().toISOString(),
                                    _debugMethod: 'standard'
                                });
                            } else {
                                // Fallback
                                const raw = item.innerText;
                                const cleaned = cleanBrutalText(raw);
                                if (cleaned) {
                                    results.push({
                                        id: urn,
                                        text: cleaned.text,
                                        author: { name: cleaned.author, imageUrl: null },
                                        createdAt: new Date().toISOString(),
                                        _debugMethod: 'fallback_smart_v2'
                                    });
                                }
                            }
                        } catch (err) { }
                    });
                    return results;
                });

                console.log(`📥 ${comments.length} comentários extraídos.`);

                if (comments.length === 0) {
                    try {
                        const html = await page.content();
                        const debugFile = path.join(__dirname, 'debug_last_view.html');
                        fs.writeFileSync(debugFile, html);
                        console.log(`🐛 Debug: HTML salvo em ${debugFile} por não encontrar comentários.`);
                    } catch (d) { }
                }

                // Salva no Firestore
                if (comments.length > 0) {
                    let newCount = 0;
                    let updatedCount = 0;
                    for (const c of comments) {
                        const cRef = db.collection('comments').doc(c.id);
                        const docSnap = await cRef.get();

                        if (!docSnap.exists) {
                            await cRef.set({
                                ...c,
                                postDbId: post.id,
                                objectUrn: post.linkedinPostId, // FIX: Link do post
                                postTopic: post.topic,
                                syncedAt: new Date(),
                                read: false,
                                replied: false,
                                source: 'rpa_puppeteer'
                            });
                            newCount++;
                        } else {
                            // SE JÁ EXISTE, ATUALIZA O TEXTO (Para refletir melhorias no parser)
                            await cRef.update({
                                text: c.text,
                                author: c.author,
                                objectUrn: post.linkedinPostId, // Garante que updates antigos peguem o link
                                _debugMethod: c._debugMethod,
                                lastSeenAt: new Date()
                            });
                            updatedCount++;
                        }
                    }
                    totalCommentsFound += newCount;
                    console.log(`💾 ${newCount} novos salvos, ${updatedCount} atualizados.`);
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
