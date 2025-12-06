const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateMedia, uploadToCloudinary } = require('./mediaHandler');
const admin = require('firebase-admin');

function forceCleanText(text) {
    if (!text) return "";
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (clean.startsWith('{')) clean = clean.substring(1);
    if (clean.endsWith('}')) clean = clean.substring(0, clean.length - 1);
    clean = clean.replace(/"content"\s*:\s*"/i, '').replace(/"content"\s*:\s*`/i, '');
    const imagePromptIndex = clean.search(/",\s*"imagePrompt"/i);
    if (imagePromptIndex !== -1) clean = clean.substring(0, imagePromptIndex);
    clean = clean.replace(/\[Link.*?\]/gi, '').replace(/\[Inserir.*?\]/gi, '');
    return clean.replace(/"\s*$/, '').replace(/`\s*$/, '').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\"/g, '"').trim();
}

function robustParse(text) {
    try {
        let jsonCandidate = text.replace(/```json/g, '').replace(/```/g, '').trim();
        jsonCandidate = jsonCandidate.replace(/(?<=: ")([\s\S]*?)(?=",\s*"imagePrompt")/g, (match) => match.replace(/\n/g, "\\n"));
        const obj = JSON.parse(jsonCandidate);
        return { content: obj.content || "", imagePrompt: obj.imagePrompt || "" };
    } catch (e) {
        const contentMatch = text.match(/"content"\s*:\s*"([\s\S]*?)(?=",)/);
        const imageMatch = text.match(/"imagePrompt"\s*:\s*"([\s\S]*?)(?="|\})/);
        return { content: contentMatch ? contentMatch[1] : text, imagePrompt: imageMatch ? imageMatch[1] : "" };
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

    // --- 3. BUSCA DE MÍDIA (PDF) ---
    const pdfDateFilter = settings.strategyPdf?.dateFilter || '2024';
    let pdfContentBase64 = null; let pdfDownloadLink = ""; let pdfModelUsed = ""; let extraContext = "";

    // Se tiver manualLink, ele vira o "recurso externo" (similar ao PDF)
    if (manualLink) {
        pdfDownloadLink = manualLink;
        extraContext = `FONTE EXTERNA: O conteúdo deve ser baseado neste link: "${manualLink}".`;
    }
    // Se não tiver link manual, e for modo PDF, busca PDF
    else if (isPdfMode) {
        try {
            console.log("🧠 Simplificando tópico para busca...");
            const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
            const m = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const searchPrompt = `
            ROLE: Search Query Optimizer API.
            TASK: Convert the topic "${randomTopic}" into a single line of 3-5 efficient search keywords for an academic database.
            CONSTRAINTS: Output ONLY the keywords separated by spaces. NO intro. NO bullets. NO new lines.
            `;
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
    OUTPUT FORMAT (JSON): { "content": "...", "imagePrompt": "..." }
    RULES: No markdown blocks. NO PLACEHOLDERS LIKE [Link].
    NEGATIVE CONSTRAINT: Do NOT include the link (${pdfDownloadLink || 'external link'}) in the final text body. Just mention that the link will be in the first comment.
    Finish with a call to action (e.g. "Link in comments").
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
        const parsed = robustParse(result.response.text());
        postContent.content = forceCleanText(parsed.content);

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