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

        // --- ESTRATÉGIA HÍBRIDA: NETWORK SNIFFER (Melhorada) ---
        // Ouvimos o tráfego de rede para interceptar o JSON puro dos comentários
        // Variável de escopo superior ao loop para persistir durante a navegação do post, mas resetada por post
        // Variável de escopo superior ao loop para persistir durante a navegação do post, mas resetada por post
        let interceptedComments = [];
        let postSocialCounts = { numLikes: 0, numComments: 0, numShares: 0, numImpressions: 0 };
        let currentScanTargetUrn = null; // ID numérico do post atual para filtro preciso

        page.on('response', async (response) => {
            try {
                const url = response.url();
                const status = response.status();

                // Filtra requisições da API Voyager (Genérica)
                // E CRÍTICO: Filtra apenas requisições relacionadas ao Post Atual se definirmos um ID
                if (status === 200 && url.includes('voyager') && !url.includes('.png') && !url.includes('.ico')) {

                    // LÓGICA DE FILTRO REFINADA:
                    // 1. Se tem o ID do post, É BOM.
                    // 2. Se é uma requisição de 'replies' (thread), o URL pode não ter o ID do post, mas tem `parentCommentUrn` ou `threading`.
                    // 3. Se não tem nenhum dos dois, ignoramos par evitar lixo do feed.

                    const isDirectPostMatch = currentScanTargetUrn && url.includes(currentScanTargetUrn);
                    const isThreadReply = url.includes('parentCommentUrn') || url.includes('threading');
                    // Permite grafql e endpoints de update/comentarios genéricos pois o ID pode estar no corpo ou encoded
                    const isGenericFeedOrGraphql = url.includes('graphql') || url.includes('feed/updates') || url.includes('socialActions');

                    if (currentScanTargetUrn && !isDirectPostMatch && !isThreadReply && !isGenericFeedOrGraphql) {
                        // console.log(`🚫 Bloqueado URL de rede não relacionado: ${url.substring(0, 100)}...`);
                        return;
                    } else if (currentScanTargetUrn && !isDirectPostMatch && isThreadReply) {
                        console.log(`✅ Rede: Permitido URL de thread/resposta (não contém ID do post, mas é relevante): ${url.substring(0, 100)}...`);
                    }

                    try {
                        const data = await response.json();

                        // 0. MAPA DE REFERÊNCIAS (URN Resolution)
                        // Muitos dados vêm "side-loaded" no array 'included'. Criamos um mapa para resolver URNs.
                        const urnMap = new Map();
                        if (data.included && Array.isArray(data.included)) {
                            data.included.forEach(item => {
                                if (item.entityUrn) urnMap.set(item.entityUrn, item);
                                if (item.urn) urnMap.set(item.urn, item);
                                if (item.objectUrn) urnMap.set(item.objectUrn, item); // Às vezes útil
                            });
                        }

                        // 1. RECURSIVE METRICS FINDER (Post Stats)
                        // 1. RECURSIVE METRICS FINDER (Post Stats - Robust)
                        const recursiveFindMetrics = (obj) => {
                            if (!obj || typeof obj !== 'object') return;

                            // Verifica se é um objeto de contagem (pode ter qualquer uma das props)
                            const hasMetrics = obj.numLikes !== undefined || obj.numComments !== undefined || obj.numShares !== undefined || obj.numImpressions !== undefined;

                            if (hasMetrics) {
                                if (typeof obj.numLikes === 'number' && obj.numLikes > postSocialCounts.numLikes) postSocialCounts.numLikes = obj.numLikes;
                                if (typeof obj.numComments === 'number' && obj.numComments > postSocialCounts.numComments) postSocialCounts.numComments = obj.numComments;
                                if (typeof obj.numShares === 'number' && obj.numShares > postSocialCounts.numShares) postSocialCounts.numShares = obj.numShares;
                                if (typeof obj.numImpressions === 'number' && obj.numImpressions > postSocialCounts.numImpressions) postSocialCounts.numImpressions = obj.numImpressions;
                            }

                            // Tenta pegar também de campos específicos de SocialActivityCounts se estirem aninhados
                            if (obj.socialActivityCounts) {
                                recursiveFindMetrics(obj.socialActivityCounts);
                            }
                            // Deep search
                            Object.values(obj).forEach(child => recursiveFindMetrics(child));
                        };
                        recursiveFindMetrics(data);

                        // 2. RECURSIVE COMMENT FINDER (ULTRA-PERMISSIVE)
                        const foundCommentObjects = [];
                        const recursiveFindComments = (obj) => {
                            if (!obj || typeof obj !== 'object') return;

                            // Heurística 1: Objeto clássico (commentary + commenter)
                            if (obj.commentary && obj.commenter) {
                                foundCommentObjects.push(obj);
                            }
                            // Heurística 2: Apenas commentary 
                            else if (obj.commentary && (obj.commentary.text || obj.commentary.attributes)) {
                                if (!obj.entityUrn || obj.entityUrn.includes('comment')) {
                                    foundCommentObjects.push(obj);
                                }
                            }
                            // Heurística 3: Por Tipo Explícito 
                            else if (obj.$type === 'com.linkedin.voyager.dash.social.Comment' || (obj.entityUrn && obj.entityUrn.includes('fsd_comment'))) {
                                foundCommentObjects.push(obj);
                            }
                            // Heurística 4: Value wrapper
                            else if (obj.value && obj.value.commentary) {
                                foundCommentObjects.push(obj.value);
                            }

                            Object.values(obj).forEach(child => recursiveFindComments(child));
                        };
                        recursiveFindComments(data);

                        if (foundCommentObjects.length > 0) {
                            console.log(`\n🔥 NETWORK: Recursive Finder achou ${foundCommentObjects.length} candidatos a comentário!`);
                            processNetworkComments(foundCommentObjects, urnMap);
                        }

                        function processNetworkComments(items, map) {
                            items.forEach(c => {
                                try {
                                    // A. RESOLVE AUTHOR (Pode estar aninhado ou ser uma referência URN)
                                    let authorObj = c.commenter;
                                    let resolvedFromMap = false;

                                    // Tenta resolver URN no mapa
                                    if (typeof authorObj === 'string') {
                                        if (map.has(authorObj)) {
                                            authorObj = map.get(authorObj);
                                            resolvedFromMap = true;
                                        }
                                    } else if (authorObj && authorObj.urn && map.has(authorObj.urn)) {
                                        // Priorize object from map if it looks more complete (e.g. has title/name)
                                        const mapped = map.get(authorObj.urn);
                                        if (mapped.title || mapped.name || mapped.firstName) {
                                            authorObj = mapped;
                                            resolvedFromMap = true;
                                        }
                                    }

                                    // Fallback para 'actor' se existir
                                    if ((!authorObj || typeof authorObj === 'string') && c.actor) {
                                        authorObj = c.actor;
                                        if (typeof authorObj === 'string' && map.has(authorObj)) {
                                            authorObj = map.get(authorObj);
                                            resolvedFromMap = true;
                                        }
                                    }

                                    // Extração do Nome (Tentativa Robusta)
                                    let authorName = '';

                                    // Estrategia 1: Campos de Texto (MiniProfile/Member)
                                    if (authorObj?.title?.text) authorName = authorObj.title.text;
                                    else if (authorObj?.annotatedTitle?.text) authorName = authorObj.annotatedTitle.text;
                                    else if (authorObj?.name?.text) authorName = authorObj.name.text;
                                    else if (typeof authorObj?.name === 'string') authorName = authorObj.name;

                                    // Estrategia 2: Estrutura de Profile (FirstName + LastName)
                                    else if (authorObj?.firstName && authorObj?.lastName) {
                                        authorName = `${authorObj.firstName} ${authorObj.lastName}`;
                                    }

                                    // DEBUG SE FALHAR
                                    if (!authorName || authorName === 'LinkedIn Member') {
                                        console.log(`⚠️ Falha ao extrair nome. URN: ${c.entityUrn}`);
                                        // Salva o objeto falho para analise
                                        try {
                                            const fs = require('fs');
                                            const debugPath = require('path').join(__dirname, 'debug_failed_authors.json');
                                            const debugData = {
                                                commentUrn: c.entityUrn,
                                                commenterRaw: c.commenter,
                                                resolvedAuthorObj: authorObj,
                                                mapHasCommenter: c.commenter && (typeof c.commenter === 'string' ? map.has(c.commenter) : map.has(c.commenter.urn))
                                            };
                                            fs.appendFileSync(debugPath, JSON.stringify(debugData, null, 2) + ',\n');
                                        } catch (e) { }

                                        authorName = 'LinkedIn Member';
                                    }

                                    // Extração da Imagem
                                    let authorImage = null;
                                    if (authorObj?.image?.attributes?.[0]?.detailData?.imageUrl) {
                                        authorImage = authorObj.image.attributes[0].detailData.imageUrl;
                                    } else if (authorObj?.picture?.artifacts?.[0]?.fileIdentifyingUrlPathSegment) {
                                        // Às vezes o link é parcial, mas vamos tentar pegar o que der
                                        authorImage = authorObj.picture.artifacts[0].fileIdentifyingUrlPathSegment;
                                        if (!authorImage.startsWith('http')) authorImage = `https://media.licdn.com/dms/image/${authorImage}`;
                                    } else if (authorObj?.picture?.rootUrl && authorObj?.picture?.artifacts?.[0]?.fileIdentifyingUrlPathSegment) {
                                        authorImage = `${authorObj.picture.rootUrl}${authorObj.picture.artifacts[0].fileIdentifyingUrlPathSegment}`;
                                    }

                                    // Extração do Subtitle (Headline)
                                    let subtitle = authorObj?.subtitle?.text || authorObj?.headline?.text || authorObj?.headline || authorObj?.occupation || '';

                                    // URL Autor
                                    let authorUrl = authorObj?.navigationUrl || authorObj?.url || '';
                                    if (typeof authorUrl === 'object' && authorUrl?.string) authorUrl = authorUrl.string;
                                    if (authorUrl && !authorUrl.startsWith('http')) authorUrl = `https://www.linkedin.com${authorUrl}`;


                                    // B. RESOLVE SOCIAL METRICS (Likes/Replies do Comentário)
                                    let likeCount = 0;
                                    let replyCount = 0;
                                    let socialDetail = c.socialDetail;

                                    if (socialDetail) {
                                        // Se for URN, resolve
                                        if (typeof socialDetail === 'string' && map.has(socialDetail)) {
                                            socialDetail = map.get(socialDetail);
                                        }
                                        else if (socialDetail.urn && map.has(socialDetail.urn)) {
                                            socialDetail = map.get(socialDetail.urn);
                                        }

                                        // Pega contadores
                                        if (socialDetail?.totalSocialActivityCounts) {
                                            likeCount = socialDetail.totalSocialActivityCounts.numLikes || 0;
                                            replyCount = socialDetail.totalSocialActivityCounts.numComments || 0;
                                        }
                                        // As vezes o socialDetail tem referência para outro objeto 'socialActivityCounts'
                                        else if (socialDetail?.socialActivityCountsUrn && map.has(socialDetail.socialActivityCountsUrn)) {
                                            const counts = map.get(socialDetail.socialActivityCountsUrn);
                                            likeCount = counts.numLikes || 0;
                                            replyCount = counts.numComments || 0;
                                        }
                                    }

                                    // C. DATA E TEXTO
                                    // Data
                                    const postedAt = c.commentary?.createdTime || c.createdTime || null;

                                    // Texto
                                    const textObj = c.commentary?.text || c.commentary || {};
                                    const text = typeof textObj === 'string' ? textObj : (textObj.text || '');

                                    // URN
                                    const urn = c.entityUrn || `urn:li:comment:gen_${Math.random()}`;

                                    if (text) {
                                        interceptedComments.push({
                                            author: authorName.trim(),
                                            subtitle: subtitle,
                                            authorImage: authorImage, // Guarda imagem para depois
                                            text: text.trim(),
                                            authorUrl: authorUrl,
                                            urn: urn,
                                            parentId: c.parentCommentUrn || null,
                                            likeCount: likeCount,
                                            replyCount: replyCount,
                                            postedAt: postedAt,
                                            source: 'network'
                                        });
                                    }
                                } catch (parseErr) {
                                    console.log('Erro parse network comment:', parseErr.message);
                                }
                            });
                        }
                    } catch (err) { }
                }
            } catch (e) {
                // Ignora erros de parse em requisições irrelevantes (imagens, css, etc)
            }
        });

        // 5. Scan dos Posts
        for (const post of postsToScan) {
            if (!post.linkedinPostId) continue;

            // Resetamos buffer de rede para este post
            interceptedComments = [];
            postSocialCounts = { numLikes: 0, numComments: 0, numShares: 0, numImpressions: 0 }; // <--- NOVO


            // Extrai apenas números do ID (Ex: urn:li:activity:7271966... -> 7271966...)
            // Isso ajuda a filtrar o tráfego de rede com precisão
            currentScanTargetUrn = post.linkedinPostId.match(/\d+/g)?.pop();

            const postUrl = `https://www.linkedin.com/feed/update/${post.linkedinPostId}/`;
            console.log(`🔎 Scan: ${post.topic} (${postUrl}) [Target ID: ${currentScanTargetUrn}]`);

            try {
                // Timeout maior e domcontentloaded
                await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                // Delay para carregar JS (Feed posts precisam de hidratação)
                await new Promise(r => setTimeout(r, 5000));

                // Tenta expandir comentários e obter métricas
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

                    if (headless) {
                        // Tenta botão de ação "Comentar" se a lista não estiver visível
                        const commentAction = await page.$('button[aria-label*="Comentar"]');
                        if (commentAction) {
                            await commentAction.click();
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    // 2. ORDENAÇÃO POR "MAIS RECENTES" (Crucial para ver tudo)
                    try {
                        const sortDropdown = await page.evaluateHandle(() => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            return buttons.find(b => b.innerText.includes('Mais recentes') || b.innerText.includes('Mais relevantes') || b.getAttribute('aria-label')?.includes('Classificar'));
                        });

                        if (sortDropdown) {
                            console.log("Found sort dropdown, attempting to switch to RECENT...");
                            await sortDropdown.click();
                            await new Promise(r => setTimeout(r, 1000));
                            await page.evaluate(() => {
                                const options = Array.from(document.querySelectorAll('div, li, span'));
                                const recentOption = options.find(el => el.innerText && el.innerText.trim() === 'Mais recentes' && el.offsetParent !== null);
                                if (recentOption) recentOption.click();
                            });
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } catch (sortErr) {
                        console.log("Could not switch sort order:", sortErr.message);
                    }

                    // 3. Carregar mais
                    let loadMoreAttempts = 0;
                    while (loadMoreAttempts < 5) {
                        const btn = await page.$('button.comments-comments-list__load-more-comments-button, button.scaffold-finite-scroll__load-button');
                        if (btn && await btn.boundingBox()) {
                            await btn.click().catch(() => { });
                            await new Promise(r => setTimeout(r, 1500));
                        } else {
                            break;
                        }
                        loadMoreAttempts++;
                    }
                } catch (e) {
                    console.log("Erro na expansão de comentários:", e.message);
                }

                // --- SEGURANÇA: FECHAR A JANELA DE MENSAGENS ANTES DE ESCANEAR ---
                try {
                    const closeMsgBtns = await page.$$('button[data-control-name="overlay.close_conversation_window"]');
                    for (const btn of closeMsgBtns) await btn.click().catch(() => { });
                    await page.evaluate(() => {
                        const hdr = document.querySelector('.msg-overlay-bubble-header');
                        if (hdr) hdr.click();
                    });
                } catch (e) { }

                // --- ESTRATÉGIA DE EXTRAÇÃO DE COMENTÁRIOS E MÉTRICAS DOM ---
                const pageResult = await page.evaluate(() => {
                    // Métrica visual (DOM Backup)
                    const domMetrics = { numLikes: 0, numComments: 0 };
                    try {
                        const reactionsNode = document.querySelector('.social-details-social-counts__reactions-count') ||
                            document.querySelector('button[aria-label*="reação"] span') ||
                            document.querySelector('button[aria-label*="reaction"] span');
                        if (reactionsNode) domMetrics.numLikes = parseInt(reactionsNode.innerText.replace(/\D/g, '') || '0');

                        const commentsNode = document.querySelector('.social-details-social-counts__comments') ||
                            document.querySelector('a[href*="comments"]') ||
                            document.querySelector('button[aria-label*="comentário"]');
                        if (commentsNode) domMetrics.numComments = parseInt(commentsNode.innerText.replace(/\D/g, '') || '0');
                    } catch (e) { }

                    // ... (Comment Extraction logic remains mostly same)
                    const scope = document.querySelector('main') || document.querySelector('.scaffold-layout__main') || document.body;
                    const getSafeText = (el) => el ? el.innerText.trim() : "";

                    // (Simplificado para caber no replace)
                    const candidates = new Set();

                    // 1. Selector Padrão
                    const selectors = ['article.comments-comment-item', '.comments-comments-list__comment-item', 'li.comments-comment-item'];
                    selectors.forEach(s => scope.querySelectorAll(s).forEach(el => candidates.add(el)));

                    // 2. Selector por ARIA LABEL (Muito mais estável)
                    // LinkedIn costuma usar aria-label="Comentário por [Nome]" ou similar
                    const ariaArticles = scope.querySelectorAll('article[aria-label], div[aria-label*="oment"]');
                    ariaArticles.forEach(el => {
                        const label = (el.getAttribute('aria-label') || "").toLowerCase();
                        if (label.includes('comentário') || label.includes('comment')) {
                            candidates.add(el);
                        }
                    });

                    // 3. Fallback: Procura artigos genéricos que tenham botão de "Responder"
                    const genericArticles = scope.querySelectorAll('article');
                    genericArticles.forEach(art => {
                        if (art.innerText.includes('Responder') || art.innerText.includes('Reply')) {
                            candidates.add(art);
                        }
                    });

                    const results = [];
                    candidates.forEach(item => {
                        try {
                            // Tenta achar autor e texto com seletores variados
                            const authorEl = item.querySelector('.comments-post-meta__name-text') ||
                                item.querySelector('.comments-post-meta__name') ||
                                item.querySelector('span.hoverable-link-text') ||
                                item.querySelector('a.app-aware-link'); // Link do perfil geralmente é o autor

                            const textEl = item.querySelector('.comments-comment-item__main-content') ||
                                item.querySelector('.feed-shared-main-content--comment') ||
                                item.querySelector('.update-components-text') ||
                                item.querySelector('span[dir="ltr"]');

                            const imgEl = item.querySelector('img');
                            const id = item.getAttribute('data-id') || Math.random().toString(36);

                            if (textEl) { // Autor é opcional no fallback drástico
                                results.push({
                                    id,
                                    text: getSafeText(textEl),
                                    author: {
                                        name: authorEl ? getSafeText(authorEl).split('\\n')[0].trim() : "LinkedIn Member",
                                        imageUrl: imgEl?.src
                                    },
                                    createdAt: new Date().toISOString(),
                                    _debugMethod: 'dom_universal'
                                });
                            }
                        } catch (e) { }
                    });



                    return { comments: results, metrics: domMetrics };
                });

                const comments = pageResult.comments;
                const domMetrics = pageResult.metrics;

                // MERGE METRICS (DOM vs Network)
                if (domMetrics.numLikes > postSocialCounts.numLikes) postSocialCounts.numLikes = domMetrics.numLikes;
                if (domMetrics.numComments > postSocialCounts.numComments) postSocialCounts.numComments = domMetrics.numComments;

                console.log(`📊 Métricas Consolidadas para ${post.topic}: Likes=${postSocialCounts.numLikes}, Comentários=${postSocialCounts.numComments}`);

                // --- MERGE NETWORK RESULTS ---
                if (interceptedComments.length > 0) {
                    console.log(`✨ Integrando ${interceptedComments.length} comentários capturados via REDE.`);
                    const networkConverted = interceptedComments.map(c => ({
                        id: c.urn || `urn:li:comment:net_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        parentId: c.parentId,
                        text: c.text,
                        author: {
                            name: c.author,
                            imageUrl: null,
                            url: c.authorUrl,
                            headline: c.subtitle
                        },
                        socialStats: {
                            likes: c.likeCount,
                            replies: c.replyCount
                        },
                        createdAt: c.postedAt ? new Date(c.postedAt).toISOString() : new Date().toISOString(),
                        _debugMethod: 'network_interception'
                    }));

                    // Merge avoiding duplicates (by ID or text+author)
                    for (const netC of networkConverted) {
                        const exists = comments.some(existing =>
                            (existing.id && existing.id === netC.id && netC.id.length > 10) || // Check ID match only if valid URN
                            (existing.text === netC.text && existing.author.name === netC.author.name)
                        );
                        if (!exists) {
                            comments.push(netC);
                        }
                    }
                }

                // FILTRAGEM PÓS-EXTRAÇÃO (Node.js)
                // Remove comentários onde o autor ou o texto indicam "Autor(a)" para não sujar o banco,
                // mas permite que a varredura (browser) os encontre para evitar falhas de lógica.
                const validComments = comments.filter(c => {
                    const isAutorName = /^autor/i.test(c.author?.name || "");
                    const isAutorText = /^autor\(a\)/i.test(c.text || "");
                    return !isAutorName && !isAutorText;
                });

                console.log(`📥 ${comments.length} comentários encontrados (Brutos).`);
                console.log(`✨ ${validComments.length} comentários válidos após filtro de 'Autor'.`);

                if (validComments.length === 0) {
                    try {
                        const html = await page.content();
                        const debugFile = path.join(__dirname, 'debug_last_view.html');
                        fs.writeFileSync(debugFile, html);
                        console.log(`🐛 Debug: HTML salvo em ${debugFile} por não encontrar comentários.`);
                    } catch (d) { }
                }

                // Salva no Firestore
                if (validComments.length > 0) {
                    let newCount = 0;
                    let updatedCount = 0;
                    for (const c of validComments) {
                        // Garante ID seguro para Firestore (sem barras)
                        const safeId = c.id.replace(/\//g, '_');
                        const cRef = db.collection('comments').doc(safeId);
                        const docSnap = await cRef.get();

                        if (!docSnap.exists) {
                            console.log(`💾 Salvando novo comentário: ${safeId} | Post: ${post.id}`);
                            await cRef.set({
                                ...c,
                                id: safeId, // Atualiza ID no objeto
                                createdAt: Date.now(), // FIX: Timestamp numérico para consistência com API
                                postDbId: post.id,
                                objectUrn: post.linkedinPostId,
                                postTopic: post.topic,
                                syncedAt: new Date(),
                                read: false,
                                replied: false,
                                source: 'rpa_puppeteer'
                            });
                            newCount++;
                        } else {
                            // SE JÁ EXISTE, ATUALIZA
                            await cRef.update({
                                text: c.text,
                                author: c.author,
                                objectUrn: post.linkedinPostId,
                                _debugMethod: c._debugMethod,
                                lastSeenAt: new Date()
                            });
                            updatedCount++;
                        }
                    }
                    totalCommentsFound += newCount;
                    console.log(`💾 ${newCount} novos salvos, ${updatedCount} atualizados.`);
                }

                // --- ATUALIZA O POST COM AS MÉTRICAS CAPTURADAS NA REDE ---
                if (postSocialCounts && (postSocialCounts.numLikes > 0 || postSocialCounts.numComments > 0 || postSocialCounts.numImpressions > 0)) {
                    console.log(`📊 Atualizando métricas do post ${post.id}:`, postSocialCounts);
                    await db.collection('posts').doc(post.id).update({
                        socialActivityCounts: postSocialCounts,
                        lastScrapedAt: new Date()
                    });
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
