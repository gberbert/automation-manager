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

                        // DETECÇÃO DE COMENTÁRIOS VIA JSON
                        // Estrutura esperada: data.data.socialDashCommentsBySocialDetail.elements[...]
                        if (data?.data?.data?.socialDashCommentsBySocialDetail?.elements) {
                            const elements = data.data.data.socialDashCommentsBySocialDetail.elements;

                            // 1. Check ELEMENTS (Direct)
                            if (Array.isArray(elements) && elements.length > 0) {
                                console.log(`\n🔥 NETWORK: Detectados ${elements.length} comentários via 'elements'!`);
                                processNetworkComments(elements);
                            }
                            // 2. Check INCLUDED (Side-loaded/GraphQL style)
                            else if (data.included && Array.isArray(data.included)) {
                                const includedComments = data.included.filter(item =>
                                    item.$type === 'com.linkedin.voyager.dash.social.Comment' ||
                                    (item.entityUrn && item.entityUrn.includes('fsd_comment'))
                                );
                                if (includedComments.length > 0) {
                                    console.log(`\n🔥 NETWORK: Detectados ${includedComments.length} comentários via 'included'!`);
                                    processNetworkComments(includedComments);
                                }

                                // --- CAPTURA DE MÉTRICAS DO POST (likes/shares/etc) ---
                                const metrics = data.included.find(item => item.$type === 'com.linkedin.voyager.dash.feed.SocialActivityCounts');
                                if (metrics) {
                                    // Atualiza se encontrar valores maiores
                                    if (metrics.numLikes > postSocialCounts.numLikes) postSocialCounts.numLikes = metrics.numLikes;
                                    if (metrics.numComments > postSocialCounts.numComments) postSocialCounts.numComments = metrics.numComments;
                                    if (metrics.numShares > postSocialCounts.numShares) postSocialCounts.numShares = metrics.numShares;
                                    if (metrics.numImpressions > postSocialCounts.numImpressions) postSocialCounts.numImpressions = metrics.numImpressions;
                                }
                            }

                            function processNetworkComments(items) {
                                items.forEach(c => {
                                    try {
                                        // Extração segura dos campos
                                        // Texto
                                        const text = c.commentary?.text?.text || c.commentary?.text || '';

                                        // Autor
                                        const author = c.commenter?.title?.text || c.commenter?.annotatedTitle?.text || 'LinkedIn Member';

                                        // URL Autor (pode ser string direta ou objeto em algumas versões)
                                        let authorUrl = c.commenter?.navigationUrl || '';
                                        if (typeof authorUrl === 'object' && authorUrl?.string) authorUrl = authorUrl.string; // Normaliza se for objeto

                                        // URN (ID único)
                                        const urn = c.entityUrn || '';

                                        // Parent URN (para threads/respostas)
                                        const parentUrn = c.parentCommentUrn || null;

                                        // Enriquecimento de Dados (New Request)
                                        const subtitle = c.commenter?.subtitle?.text || '';
                                        const likeCount = c.socialDetail?.totalSocialActivityCounts?.numLikes || 0;
                                        const replyCount = c.socialDetail?.totalSocialActivityCounts?.numComments || 0; // Respostas a este comentÃ¡rio
                                        const postedAt = c.commentary?.createdTime || null; // Timestamp se disponÃ­vel

                                        if (text) {
                                            interceptedComments.push({
                                                author: author.trim(),
                                                subtitle: subtitle, // <--- NOVO
                                                text: text.trim(),
                                                authorUrl: authorUrl,
                                                urn: urn,
                                                parentId: parentUrn,
                                                likeCount: likeCount, // <--- NOVO
                                                replyCount: replyCount, // <--- NOVO
                                                postedAt: postedAt, // <--- NOVO
                                                source: 'network'
                                            });
                                        }
                                    } catch (parseErr) {
                                        console.log('Erro ao fazer parse de um comentário de rede:', parseErr.message);
                                    }
                                });
                            }
                        }

                        // (Opcional) Debug: Salva arquivos se ainda quiser inspecionar, mas com timestamp para não sobrescrever
                        /*
                        const dataStr = JSON.stringify(data);
                        if (
                            dataStr.length > 1500 &&
                            (dataStr.includes('text') || dataStr.includes('comment')) &&
                            capturedNetworkComments.length < 5 // Limitando para não spammar
                        ) {
                            const fileName = `debug_network_${Date.now()}.json`;
                            const savePath = path.join(process.cwd(), fileName);
                            // fs.writeFileSync(savePath, dataStr); // Descomentar se precisar debugar
                            // capturedNetworkComments.push(savePath);
                        }
                        */

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

                    // 2. ORDENAÇÃO POR "MAIS RECENTES" (Crucial para ver tudo)
                    // Tenta encontrar o dropdown de ordenação. Classes mudam, então buscamos por texto/aria-label
                    try {
                        const sortDropdown = await page.evaluateHandle(() => {
                            // Procura botões que pareçam ser de dropdown de sort
                            const buttons = Array.from(document.querySelectorAll('button'));
                            return buttons.find(b => b.innerText.includes('Mais recentes') || b.innerText.includes('Mais relevantes') || b.getAttribute('aria-label')?.includes('Classificar'));
                        });

                        if (sortDropdown) {
                            console.log("Found sort dropdown, attempting to switch to RECENT...");
                            await sortDropdown.click();
                            await new Promise(r => setTimeout(r, 1000));

                            // Agora clica na opção 'Mais recentes' no menu que abriu
                            await page.evaluate(() => {
                                const options = Array.from(document.querySelectorAll('div, li, span')); // Genérico para achar a opção
                                const recentOption = options.find(el => el.innerText && el.innerText.trim() === 'Mais recentes' && el.offsetParent !== null);
                                if (recentOption) recentOption.click();
                            });

                            // Espera reload da lista
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } catch (sortErr) {
                        console.log("Could not switch sort order:", sortErr.message);
                    }

                    // 3. Carrega mais comentários se houver paginação (Vigoroso)
                    // Como estamos ouvindo a REDE, cada clique aqui gera um request útil
                    let loadMoreAttempts = 0;
                    while (loadMoreAttempts < 5) {
                        const loadMoreSelectors = [
                            'button.comments-comments-list__load-more-comments-button',
                            'button.scaffold-finite-scroll__load-button',
                            '.comments-comments-list__show-previous-button'
                        ];

                        let clicked = false;
                        for (const sel of loadMoreSelectors) {
                            const btn = await page.$(sel);
                            if (btn) {
                                // Verifica visibilidade
                                const isVisible = await btn.boundingBox();
                                if (isVisible) {
                                    console.log(`Clicando em carregar mais (Attempt ${loadMoreAttempts + 1})...`);
                                    await btn.click().catch(() => { });
                                    await new Promise(r => setTimeout(r, 2000)); // Wait for network
                                    clicked = true;
                                    break; // Clica um por vez e reavalia
                                }
                            }
                        }

                        if (!clicked) break; // Se não achou nenhum botão pra clicar, sai
                        loadMoreAttempts++;
                    }
                } catch (e) {
                    console.log("Erro na expansão de comentários:", e.message);
                }

                // --- SEGURANÇA: FECHAR A JANELA DE MENSAGENS ANTES DE ESCANEAR ---
                try {
                    const closeMsgBtns = await page.$$('button[data-control-name="overlay.close_conversation_window"]');
                    for (const btn of closeMsgBtns) {
                        await btn.click().catch(() => { });
                    }
                    const minimizeMsgBtn = await page.$('.msg-overlay-bubble-header__control--minimize');
                    if (minimizeMsgBtn) await minimizeMsgBtn.click().catch(() => { });

                    // Tentativa extra de fechar qualquer overlay de chat visível via DOM
                    await page.evaluate(() => {
                        const chatHeader = document.querySelector('.msg-overlay-bubble-header');
                        if (chatHeader) chatHeader.click();
                    });
                } catch (e) { }

                // --- ESTRATÉGIA DE EXTRAÇÃO DE COMENTÁRIOS ---
                const comments = await page.evaluate(() => {
                    // DEFINE ESCOPO: Tenta focar apenas no conteúdo principal, ignorando overlays globais
                    // LinkedIn geralmente usa 'main' ou '.scaffold-layout__main' para o feed
                    const scope = document.querySelector('main') || document.querySelector('.scaffold-layout__main') || document.body;

                    // --- FUNÇÕES AUXILIARES ---
                    const getSafeText = (el) => el ? el.innerText.trim() : "";

                    // NOVA Versão do Fallback Inteligente (Smart Parsing)
                    const cleanBrutalText = (text, element = null) => {
                        // VERIFICAÇÃO DE SEGURANÇA 1: Se o elemento vier do Chat, ignorar
                        if (element && element.closest && (element.closest('.msg-overlay-list-bubble') || element.closest('.msg-overlay-conversation-bubble'))) {
                            return null;
                        }

                        let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        if (lines.length < 2) return null;

                        // 1. Autor: Tenta limpar sufixos (bullet, ponto, grau de conexão)
                        let authorLine = lines[0].replace(/[\.·•]\s*[123]º.*/, '').replace(/\(.*\)/, '').trim();



                        // 2. Processa o resto e o próprio autor se necessário
                        let remainingLines = lines.slice(1);

                        // CASO ESPECIAL: O texto do comentário as vezes cola na linha do autor ou na primeira linha de texto
                        // Ex: "19 min Excelente tema! Exibir tradução..."
                        // Vamos limpar padrões de tempo e tradução de TODAS as linhas processadas
                        const cleanLineContent = (msg) => {
                            return msg
                                .replace(/^\d+\s*[hdm]\s+/i, '') // Remove "19 min " do inicio
                                .replace(/Exibir tradução.*/i, '')
                                .replace(/See translation.*/i, '')
                                .replace(/Exibir tradução deste comentário.*/i, '')
                                .trim();
                        };

                        let cleanCommentLines = [];

                        for (let i = 0; i < remainingLines.length; i++) {
                            const line = remainingLines[i];
                            const lowerLine = line.toLowerCase();

                            // A. Ignora Linhas de Métrica/Conexão/Tempo isolado
                            if (/^[•·]\s*[123]º/.test(line) || line === '•' || line.includes('• 1º') || line.includes('• 2º')) continue;
                            if (/^\d+\s*[hdm]\s*$/.test(line) || ['agora', 'editado', '(editado)'].includes(lowerLine)) continue;

                            // B. Ignora Título Profissional (Heurística)
                            if (line.includes('|') || line.includes('CRP') || (line.length > 30 && (line.includes(' at ') || line.includes(' em ') || line.includes('Designer') || line.includes('Engineer') || line.includes('Consultor')))) continue;

                            // C. Ignora Rodapé
                            const junkKeywords = ['gostar', 'responder', 'ver tradução', 'carregar anteriores', '...mais', 'gostei', 'like', 'reply', 'comentários', 'ver perfil de'];
                            if (junkKeywords.some(kw => lowerLine === kw || (lowerLine.includes(kw) && line.length < 25))) continue;

                            // D. Ignora números soltos
                            if (/^\d+$/.test(line)) continue;

                            // E. Segurança: Detectar padrões de CHAT/MENSAGEM PRIVADA
                            if (line.includes("enviou as seguintes mensagens") || line.includes("Ver perfil de")) return null;

                            const cleaned = cleanLineContent(line);
                            if (cleaned.length > 0) cleanCommentLines.push(cleaned);
                        }

                        let finalText = cleanCommentLines.join(' ').trim();

                        // Limpeza Final (Catch-all)
                        finalText = cleanLineContent(finalText);

                        if (!finalText) return null;

                        // Segurança Final: Se sobrou texto com cara de chat
                        if (finalText.includes("enviou as seguintes mensagens") || finalText.includes("Ver perfil de")) return null;



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

                    const candidates = new Set();



                    for (const sel of possibleItemSelectors) {
                        const found = scope.querySelectorAll(sel);
                        if (found.length > 0) {
                            found.forEach(el => {
                                // FILTRO: Apenas elementos visíveis e FORA do chat
                                if (el.offsetHeight > 0 && !el.closest('.msg-overlay-list-bubble') && !el.closest('.msg-overlay-conversation-bubble')) {
                                    candidates.add(el);
                                }
                            });
                            // Se achou com um seletor, provavelmente é o padrão da página. 
                            // Mas não bloqueamos a estratégia B para garantir cobertura total.
                            if (candidates.size > 0) break;
                        }
                    }

                    // 2. ESTRATÉGIA B: SELF-HEALING REVERSO (AGORA RODA SEMPRE PARA COMPLEMENTAR)
                    // console.log("⚠️ Seletores de classe falharam. Iniciando Self-Healing Reverso...");
                    const actionButtons = Array.from(scope.querySelectorAll('button'));
                    actionButtons.forEach(btn => {
                        // Ignora botões dentro do chat
                        if (btn.closest('.msg-overlay-list-bubble') || btn.closest('.msg-overlay-conversation-bubble')) return;

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

                    const items = Array.from(candidates);

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
                                const cleaned = cleanBrutalText(raw, item);
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

                // --- MERGE NETWORK RESULTS ---
                if (interceptedComments.length > 0) {
                    console.log(`✨ Integrando ${interceptedComments.length} comentários capturados via REDE.`);
                    // Convert generic intercepted (network) format to 'comments' format
                    const networkConverted = interceptedComments.map(c => ({
                        id: c.urn || `urn:li:comment:net_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        parentId: c.parentId,
                        text: c.text,
                        author: {
                            name: c.author,
                            imageUrl: null,
                            url: c.authorUrl,
                            headline: c.subtitle // <--- NOVO
                        },
                        socialStats: { // <--- NOVO
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

                    // --- ATUALIZA O POST COM AS MÉTRICAS CAPTURADAS NA REDE ---
                    if (postSocialCounts && (postSocialCounts.numLikes > 0 || postSocialCounts.numComments > 0)) {
                        console.log(`📊 Atualizando métricas do post ${post.id}:`, postSocialCounts);
                        await db.collection('posts').doc(post.id).update({
                            socialActivityCounts: postSocialCounts,
                            lastScrapedAt: new Date()
                        });
                    }

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
