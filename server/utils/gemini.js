const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateMedia, uploadToCloudinary } = require('./mediaHandler');
const admin = require('firebase-admin');

function forceCleanText(text) {
    if (!text) return "";
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (clean.startsWith('{')) clean = clean.substring(1);
    if (clean.endsWith('}')) clean = clean.substring(0, clean.length - 1);

    // Remove specific keys common in leaks
    clean = clean.replace(/"content"\s*:\s*"/i, '').replace(/"content"\s*:\s*`/i, '');

    // Aggressive cut at imagePrompt or image_prompt
    const patterns = [
        /",\s*"imagePrompt"/i,
        /"\s*,\s*"imagePrompt"/i,
        /"imagePrompt"\s*:/i,
        /"image_prompt"\s*:/i
    ];

    for (const p of patterns) {
        const idx = clean.search(p);
        if (idx !== -1) {
            clean = clean.substring(0, idx);
            break;
        }
    }

    clean = clean.replace(/\[Link.*?\]/gi, '').replace(/\[Inserir.*?\]/gi, '');
    return clean.replace(/"\s*$/, '').replace(/`\s*$/, '').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\"/g, '"').trim();
}

function robustParse(text) {
    try {
        let jsonCandidate = text.replace(/```json/g, '').replace(/```/g, '').trim();
        // Fix common unescaped quotes inside content before valid imagePrompt key
        // Look for content value until imagePrompt key starts
        jsonCandidate = jsonCandidate.replace(/(?<=: ")([\s\S]*?)(?=",\s*"imagePrompt")/g, (match) => {
            return match.replace(/(?<!\\)"/g, '\\"').replace(/\n/g, "\\n");
        });

        const obj = JSON.parse(jsonCandidate);
        return { content: obj.content || "", imagePrompt: obj.imagePrompt || "" };
    } catch (e) {
        // Fallback: Use Regex to extract
        const contentMatch = text.match(/"content"\s*:\s*"([\s\S]*?)(?=",\s*"imagePrompt"|"\s*,\s*"imagePrompt"|"\s*,\s*"image_prompt"|}$)/);
        const imageMatch = text.match(/"image(Prompt|_prompt)"\s*:\s*"([\s\S]*?)(?="|\})/);

        let extractedContent = contentMatch ? contentMatch[1] : text;

        // Final safety net: if content still looks like it has the imagePrompt key at the end (regex fail)
        const leakCheck = extractedContent.search(/"image(Prompt|_prompt)"\s*:/);
        if (leakCheck !== -1) extractedContent = extractedContent.substring(0, leakCheck);

        return {
            content: extractedContent,
            imagePrompt: imageMatch ? imageMatch[2] : ""
        };
    }
}

const axios = require('axios'); // Ensure axios is required

// --- HELPER: BUSCAR CONTEÚDO DO LINK ---
async function fetchLinkContent(url) {
    try {
        console.log(`🌍 Scraping link: ${url}`);
        const response = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        let html = response.data;
        // Simple cleanup: remove scripts, styles, tags
        // remove all tags but keep text
        html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
        html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
        html = html.replace(/<[^>]+>/g, ' ');
        html = html.replace(/\s+/g, ' ').trim();

        // Cap length, but ensure we have something
        if (html.length < 50) return null; // Too short, probably blocked or empty
        return html.substring(0, 4000); // Increase limit slightly to give more context 
    } catch (e) {
        console.warn(`⚠️ Erro ao acessar link ${url}: ${e.message}`);
        return null;
    }
}

// --- FUNÇÃO PARA MARCAR TÓPICO COM ERRO NO BANCO ---
async function markTopicAsFailed(topic) {
    try {
        const db = admin.firestore();
        const ref = db.collection('settings').doc('global');

        await db.runTransaction(async (t) => {
            const doc = await t.get(ref);
            if (!doc.exists) return;
            const data = doc.data();

            const markList = (list) => {
                if (!Array.isArray(list)) return list;
                return list.map(item => {
                    if (item === topic && !item.startsWith("⚠️")) {
                        return `⚠️ ${item}`;
                    }
                    return item;
                });
            };

            let updates = {};
            if (data.strategyPdf?.topics?.includes(topic)) updates['strategyPdf.topics'] = markList(data.strategyPdf.topics);
            if (data.strategyImage?.topics?.includes(topic)) updates['strategyImage.topics'] = markList(data.strategyImage.topics);
            if (data.topics?.includes(topic)) updates['topics'] = markList(data.topics);

            if (Object.keys(updates).length > 0) {
                t.update(ref, updates);
                console.log(`[DB] ⚠️ Tópico marcado com alerta no Firestore: "${topic}"`);
            }
        });
    } catch (e) {
        console.error("Erro ao marcar tópico no banco:", e.message);
    }
}

// --- GERAR REAÇÃO (MANTIDO) ---
async function generateReaction(type, context, content, link, settings, image) {
    if (!settings.geminiApiKey) throw new Error("Gemini Key Missing");
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-2.5-flash" });
    const strategy = type === 'repost' ? settings.strategyRepost : settings.strategyComment;
    const template = strategy?.template || "Analise o conteúdo e escreva algo relevante.";

    const prompt = `
    VOCÊ ESTÁ NO PAPEL DE: ${context}
    TAREFA: Escrever um ${type === 'repost' ? 'TEXTO PARA RECOMPARTILHAR (REPOST)' : 'COMENTÁRIO'} sobre o conteúdo abaixo.
    CONTEÚDO ORIGINAL: "${content}". Link: ${link || 'N/A'}
    ${image ? 'IMAGEM: Uma imagem foi fornecida como contexto principal.' : ''}
    SEU OBJETIVO: ${template}
    REGRAS: Seja natural. Use o tom de voz do perfil. Retorne APENAS o texto final. Idioma: ${settings.language === 'pt-BR' ? "Português (Brasil)" : "English"}
    `;

    const parts = [{ text: prompt }];
    if (image && image.startsWith('data:image')) {
        const mimeType = image.split(';')[0].split(':')[1];
        const data = image.split(',')[1];
        parts.push({ inlineData: { data, mimeType } });
    }

    const result = await model.generateContent(parts);
    return result.response.text().trim();
}

// --- FUNÇÃO PRINCIPAL ---
async function generatePost(settings, logFn = null, manualTopic = null, manualImage = null, manualLink = null) {
    if (!settings.geminiApiKey) { if (logFn) await logFn('error', 'Gemini Key Missing'); return null; }

    const postFormat = settings.postFormat || 'image';
    const isPdfMode = postFormat === 'pdf';
    settings.activeFormat = postFormat;

    // --- 1. SELEÇÃO DO TÓPICO ---
    let randomTopic;
    let topicIndex = -1;

    if (manualTopic) {
        randomTopic = manualTopic;
        console.log(`📝 Tópico Manual: "${randomTopic}"`);
    } else {
        const targetStrategy = isPdfMode ? settings.strategyPdf : settings.strategyImage;
        const pool = targetStrategy?.topics || settings.topics || [];
        const validPool = pool.filter(t => !t.startsWith("⚠️"));

        if (!validPool || validPool.length === 0) {
            if (pool.length > 0) console.warn("⚠️ Pool só contém tópicos marcados com erro. Tentando um deles...");
            else throw new Error(`Pool de Tópicos vazio.`);
        }

        const usePool = validPool.length > 0 ? validPool : pool;
        topicIndex = Math.floor(Math.random() * usePool.length);
        randomTopic = usePool[topicIndex];
        console.log(`🎲 Tópico selecionado: "${randomTopic}"`);
    }

    // --- 2. CONTEXTO ---
    const targetStrategy = isPdfMode ? settings.strategyPdf : settings.strategyImage;
    const contextPool = targetStrategy?.contexts || settings.contexts || [];
    let randomContext = "";
    let contextIndex = -1;
    if (contextPool.length > 0) {
        contextIndex = Math.floor(Math.random() * contextPool.length);
        const ctxItem = contextPool[contextIndex];
        randomContext = typeof ctxItem === 'object' ? ctxItem.text : ctxItem;
    }

    // --- 3. BUSCA DE MÍDIA (PDF) E LINK SCAN ---
    const pdfDateFilter = settings.strategyPdf?.dateFilter || '2024';
    let pdfContentBase64 = null; let pdfDownloadLink = ""; let pdfModelUsed = ""; let extraContext = "";

    // Se tiver manualLink, busca o conteúdo
    if (manualLink) {
        pdfDownloadLink = manualLink;
        const scrapedText = await fetchLinkContent(manualLink);
        if (scrapedText) {
            extraContext = `FONTE EXTERNA OBRIGATÓRIA: O texto do post DEVEM ser baseado EXCLUSIVAMENTE no seguinte conteúdo extraído do link: "${scrapedText}".`;
        } else {
            extraContext = `FONTE EXTERNA: O conteúdo deve ser baseado no link: "${manualLink}". (Não foi possível ler o conteúdo automaticamente, use seu conhecimento geral sobre o link se possível).`;
        }
    }
    // Se não tiver link manual, e for modo PDF, busca PDF
    else if (isPdfMode) {
        try {
            console.log("🧠 Simplificando tópico para busca...");
            const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
            const m = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const searchPrompt = `ROLE: Search Query Optimizer API. TASK: Convert the topic "${randomTopic}" into a single line of 3-5 efficient search keywords for an academic database. CONSTRAINTS: Output ONLY the keywords separated by spaces. NO intro. NO bullets. NO new lines.`;
            const t = await m.generateContent(searchPrompt);
            const simplifiedQuery = t.response.text().replace(/[\r\n]+/g, " ").trim().substring(0, 100);

            console.log(`🔍 Query Simplificada: "${simplifiedQuery}"`);
            const pdfResult = await generateMedia(simplifiedQuery, { ...settings, activeFormat: 'pdf', pdfDateFilter }, logFn);

            pdfContentBase64 = pdfResult.pdfBase64;
            pdfDownloadLink = pdfResult.imageUrl;
            pdfModelUsed = pdfResult.modelUsed;
            extraContext = `Documento Anexo: "${pdfResult.metaTitle}". Instrução: Baseie o post EXCLUSIVAMENTE neste documento.`;

        } catch (e) {
            if (e.message === "PDF_NOT_FOUND" && !manualTopic) {
                console.warn(`⛔ Tópico cancelado: "${randomTopic}" - Sem PDF.`);
                await markTopicAsFailed(randomTopic);
                if (logFn) await logFn('warn', `⚠️ Tópico Falhou: ${randomTopic}`, `Nenhum PDF encontrado.`);
            }
            return null;
        }
    }

    // --- 4. GERAÇÃO DE TEXTO ---
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const textModel = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-2.5-flash" });
    const templateBase = targetStrategy?.template || "Crie um post profissional.";

    const finalPrompt = `
    ${templateBase}
    TÓPICO: "${randomTopic}"
    ${extraContext}
    ${manualImage ? 'NOTA: Uma imagem foi fornecida manualmente. Use-a como base principal para o texto.' : ''}
    CONTEXTO: "${randomContext}"
    IDIOMA: ${settings.language === 'pt-BR' ? "Portuguese (Brazil)" : "English"}
    OUTPUT FORMAT (JSON): { "content": "...", "imagePrompt": "Create a DALL-E 3 image prompt that VISUALLY SUMMARIZES the content you just wrote. Ignore generic styles. The image must represent the core message of the text." }
    RULES: 
    - No markdown blocks. 
    - NO PLACEHOLDERS LIKE [Link].
    - CITATION: You MUST cite the article or publication mentioned in the external source to give the post authority (e.g., "According to...", "As highlighted in the article...").
    - NEGATIVE CONSTRAINT: Do NOT include the actual URL link (${pdfDownloadLink || 'external link'}) in the final text body.
    - ENDING: You MUST finish with the exact phrase: "Leia mais sobre o tema no link do artigo que estará nos comentários." or similar in the target language.
    `;

    let postContent = { content: "", imagePrompt: "" };
    try {
        const parts = [{ text: finalPrompt }];
        if (pdfContentBase64) parts.push({ inlineData: { data: pdfContentBase64, mimeType: "application/pdf" } });
        if (manualImage && manualImage.startsWith('data:image')) {
            const mimeType = manualImage.split(';')[0].split(':')[1];
            const data = manualImage.split(',')[1];
            parts.push({ inlineData: { data, mimeType } });
        }
        const result = await textModel.generateContent(parts);
        const textResponse = result.response.text();
        const parsed = robustParse(textResponse);

        postContent.content = forceCleanText(parsed.content);

        // --- 4.1 FALLBACK IF JSON PARSING FAILS ---
        if (!postContent.content) {
            console.warn("⚠️ Falha no parsing JSON. Usando texto bruto como conteúdo.");
            // Tenta limpar o JSON block manualmente e pega tudo
            let rawText = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            // Se ainda parecer JSON, tenta extrair 'content' com regex menos estrito
            const contentMatch = rawText.match(/"content"\s*:\s*"([\s\S]*?)(?=",\s*"imagePrompt")/);
            if (contentMatch) {
                postContent.content = contentMatch[1];
            } else {
                // Se tudo falhar, usa o texto todo, mas avisa
                postContent.content = rawText;
            }
            // Limpa suxeiras finais
            postContent.content = forceCleanText(postContent.content);
        }

        // --- 4.2 IMAGE PROMPT LOGIC ---
        // STRICT: Use the AI provided prompt if available. Only fallback if absolutely empty.
        if (parsed.imagePrompt && parsed.imagePrompt.length > 10) {
            postContent.imagePrompt = parsed.imagePrompt;
        } else {
            postContent.imagePrompt = `A high quality, professional image representing the concept of: ${randomTopic}. 8k resolution.`;
        }

        // REMOVED: The logic that overwrote the prompt with "Editorial style..." based on keywords. We now trust the AI's summary.

        // Verifica se o link vazou para o texto
        if (pdfDownloadLink && postContent.content.includes(pdfDownloadLink)) {
            postContent.content = postContent.content.replace(pdfDownloadLink, '(Link in comments)');
        }

    } catch (e) {
        if (logFn) await logFn('error', 'Erro Texto Gemini', e.message);
        return null;
    }

    // --- 5. IMAGEM FINAL ---
    let finalMediaData = { imageUrl: '', modelUsed: 'None' };
    try {
        if (manualImage) {
            console.log("📸 Usando imagem manual fornecida...");
            const uploadedUrl = await uploadToCloudinary(manualImage, settings);
            finalMediaData = { imageUrl: uploadedUrl, modelUsed: 'Manual Upload' };
        } else {
            const imageSettings = { ...settings, activeFormat: 'image', forceImageGeneration: true };
            finalMediaData = await generateMedia(postContent.imagePrompt, imageSettings, logFn);
        }
    } catch (e) { }

    const finalMediaType = (isPdfMode && pdfDownloadLink && !manualLink) ? 'pdf' : 'image'; // Se for link manual, é 'image' (ou text) mas com link extra

    return {
        topic: randomTopic,
        content: postContent.content,
        imagePrompt: postContent.imagePrompt,
        imageUrl: finalMediaData.imageUrl,
        modelUsed: isPdfMode ? `${pdfModelUsed} + ${finalMediaData.modelUsed}` : finalMediaData.modelUsed,
        mediaType: finalMediaType,
        originalPdfUrl: pdfDownloadLink, // Usado para comentar o link
        manualRequired: false,
        metaIndexes: {
            topic: manualTopic ? 'Manual' : (topicIndex + 1),
            context: contextIndex >= 0 ? contextIndex + 1 : null
        }
    };
}


// --- REFINAR TEXTO (NOVO) ---
async function refineText(settings, currentContent, instructions) {
    if (!settings.geminiApiKey) throw new Error("Gemini Key Missing");

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-2.5-flash" });

    const prompt = `
    ROLE: Professional Social Media Editor.
    TASK: Rewrite/Refine the following post content based SPECIFICALLY on the user's instructions.
    
    ORIGINAL CONTENT:
    "${currentContent}"

    USER INSTRUCTIONS:
    "${instructions}"

    CONSTRAINTS:
    - Keep the same tone unless instructed otherwise.
    - Maintain the original meaning but apply the requested changes.
    - Output ONLY the new text. No intro/outro.
    - Language: ${settings.language === 'pt-BR' ? "Portuguese (Brazil)" : "English"}
    `;

    const result = await model.generateContent(prompt);
    let refinements = result.response.text().trim();

    // Cleanup if accidentally wraps in markdown
    refinements = forceCleanText(refinements);

    return refinements;
}

module.exports = { generatePost, generateReaction, refineText };