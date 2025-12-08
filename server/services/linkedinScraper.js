const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Caminho para salvar cookies (sessão)
const COOKIES_PATH = path.join(__dirname, '../../linkedin_cookies.json');

async function scrapeLinkedInComments(db, postsToScan = [], options = {}) {
    const { email, password, headless = false } = options;

    console.log("🚀 Iniciando RPA LinkedIn Scraper...");

    const browser = await puppeteer.launch({
        headless: headless, // False para ver o navegador (útil para debug e evitar bloqueios)
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized', // Janela maximizada
            '--disable-notifications' // Bloqueia notificações
        ]
    });

    try {
        const page = await browser.newPage();

        // --- 1. GESTÃO DE SESSÃO (COOKIES) ---
        if (fs.existsSync(COOKIES_PATH)) {
            const cookiesString = fs.readFileSync(COOKIES_PATH);
            const cookies = JSON.parse(cookiesString);
            await page.setCookie(...cookies);
            console.log("🍪 Cookies carregados.");
        }

        // --- 2. LOGIN (SE NECESSÁRIO) ---
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2' });

        // Verifica se está logado buscando um elemento da home
        const isLoggedIn = await page.$('.global-nav__content') !== null;

        if (!isLoggedIn) {
            console.log("⚠️ Não logado. Iniciando login...");
            await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2' });

            if (email && password) {
                await page.type('#username', email, { delay: 100 });
                await page.type('#password', password, { delay: 100 });

                console.log("⌨️ Credenciais preenchidas. Aguardando login...");

                await Promise.all([
                    page.click('.btn__primary--large'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
                ]);
            } else {
                console.log("🛑 Credenciais não fornecidas. Por favor, faça login manualmente no navegador aberto.");
                // Aguarda login manual por até 2 minutos
                await page.waitForSelector('.global-nav__content', { timeout: 120000 });
            }

            // Salva cookies após login bem sucedido
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
            console.log("💾 Novos cookies salvos.");
        } else {
            console.log("✅ Já logado com sucesso.");
        }

        let totalCommentsFound = 0;

        // --- 3. VARREDURA DE POSTS ---
        for (const post of postsToScan) {
            if (!post.linkedinPostId) continue;

            // Extrai o ID do Linkedin (se for URN ou ID numérico)
            // Formato esperado de URL: https://www.linkedin.com/feed/update/urn:li:share:XXXXX/
            // Nosso linkedinPostId geralmente é apenas a URN "urn:li:share:123"
            const postUrl = `https://www.linkedin.com/feed/update/${post.linkedinPostId}/`;

            console.log(`🔎 Acessando post: ${post.topic} (${postUrl})`);

            try {
                await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
                await new Promise(r => setTimeout(r, 3000)); // Delay humano

                // --- EXPANSÃO DE COMENTÁRIOS ---
                // Tenta clicar em "Load more comments" se existir
                // Seletores mudam, tentar abordagens genéricas
                try {
                    // Rola até o fim para carregar dinâmicos
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await new Promise(r => setTimeout(r, 2000));

                    // Tenta clicar em botões de "ver mais comentários"
                    const loadMoreSelectors = [
                        'button.comments-comments-list__load-more-comments-button',
                        'button.scaffold-finite-scroll__load-button'
                    ];

                    for (const sel of loadMoreSelectors) {
                        const btn = await page.$(sel);
                        if (btn) {
                            await btn.click();
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }
                } catch (e) {
                    console.log("⚠️ Erro ao expandir comentários (pode não haver mais):", e.message);
                }

                // --- EXTRAÇÃO ---
                const comments = await page.evaluate(() => {
                    const items = document.querySelectorAll('article.comments-comment-item');
                    const results = [];

                    items.forEach(item => {
                        try {
                            const authorEl = item.querySelector('.comments-post-meta__name-text');
                            const textEl = item.querySelector('.comments-comment-item__main-content');
                            const imgEl = item.querySelector('.comments-post-meta__profile-image');
                            const timeEl = item.querySelector('.comments-comment-item__timestamp'); // Pode variar

                            // Link do perfil
                            const linkEl = item.querySelector('a.comments-post-meta__actor-link');

                            if (authorEl && textEl) {
                                let authorName = authorEl.innerText.trim();
                                // Remove sufixos como "• 2nd" etc se estiverem dentro do span
                                authorName = authorName.split('\n')[0].trim();

                                const text = textEl.innerText.trim();
                                const avatar = imgEl ? imgEl.src : null;
                                const profileUrl = linkEl ? linkEl.href : null;

                                // ID do comentário (urn)
                                // O elemento article geralmente tem data-id="urn:li:comment:..." ou id="..."
                                const urn = item.getAttribute('data-id') || item.getAttribute('id');

                                results.push({
                                    id: urn || `manual_${Date.now()}_${Math.random()}`,
                                    text: text,
                                    author: {
                                        name: authorName,
                                        imageUrl: avatar,
                                        profileUrl: profileUrl
                                    },
                                    createdAt: new Date().toISOString() // Data aproximada (extração exata é chata)
                                });
                            }
                        } catch (err) {
                            // Ignora item com erro
                        }
                    });
                    return results;
                });

                console.log(`📥 Encontrados ${comments.length} comentários no post.`);

                // --- SALVAR NO DB ---
                if (comments.length > 0) {
                    let newCount = 0;
                    for (const c of comments) {
                        const commentRef = db.collection('comments').doc(c.id); // Usa URN como ID
                        const docSnap = await commentRef.get();

                        if (!docSnap.exists) {
                            await commentRef.set({
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
                    console.log(`💾 Salvos ${newCount} novos comentários.`);
                }

            } catch (err) {
                console.error(`❌ Falha ao processar post ${post.id}:`, err.message);
            }
        }

        console.log(`🏁 RPA Finalizado. Total de novos comentários: ${totalCommentsFound}`);
        return { success: true, newComments: totalCommentsFound };

    } catch (error) {
        console.error("🔥 Erro fatal no Scraper:", error);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeLinkedInComments };
