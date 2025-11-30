const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateMedia } = require('./mediaHandler');

function forceCleanText(text) {
    if (!text) return "";
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (clean.startsWith('{')) clean = clean.substring(1);
    if (clean.endsWith('}')) clean = clean.substring(0, clean.length - 1);
    clean = clean.replace(/"content"\s*:\s*"/i, '').replace(/"content"\s*:\s*`/i, '');
    const imagePromptIndex = clean.search(/",\s*"imagePrompt"/i);
    if (imagePromptIndex !== -1) clean = clean.substring(0, imagePromptIndex);
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

async function generatePost(settings, logFn = null) {
    if (!settings.geminiApiKey) {
        if(logFn) await logFn('error', 'Gemini Key Missing');
        return null;
    }

    const postFormat = settings.postFormat || 'image';
    const isPdfMode = postFormat === 'pdf'; 
    
    settings.activeFormat = postFormat; 
    settings.activePdfStrategy = settings.strategyPdf?.source || 'arxiv';

    let targetStrategy = isPdfMode ? settings.strategyPdf : settings.strategyImage;
    if (!targetStrategy) targetStrategy = settings;

    const pool = targetStrategy.topics || settings.topics || [];
    if (!pool || pool.length === 0) throw new Error(`Pool de Tópicos vazio.`);
    
    const topicIndex = Math.floor(Math.random() * pool.length);
    const randomTopic = pool[topicIndex];
    
    const contextPool = targetStrategy.contexts || settings.contexts || [];
    let randomContext = "";
    let contextIndex = -1;
    if (contextPool.length > 0) {
        contextIndex = Math.floor(Math.random() * contextPool.length);
        randomContext = contextPool[contextIndex];
    }

    console.log(`🎲 Tópico #${topicIndex + 1}: "${randomTopic}"`);
    // Filtro de ano configurado no Frontend
    const pdfDateFilter = settings.strategyPdf?.dateFilter || '2024';

    let pdfContentBase64 = null;
    let pdfDownloadLink = "";
    let extraContext = "";
    let pdfModelUsed = "";
    if (isPdfMode) {
        try {
            console.log("🧠 Simplificando tópico...");
            const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
            const m = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const t = await m.generateContent(`
                Role: Search Query Optimizer.
                Task: Convert topic to SINGLE short string of keywords.
                Topic: "${randomTopic}"
                Constraints: Output ONLY the keywords.
            `);
            const simplifiedQuery = t.response.text().trim();
            console.log(`🔍 Query: "${simplifiedQuery}"`);
            
            // Passa o ano configurado para a busca
            const pdfResult = await generateMedia(simplifiedQuery, { ...settings, activeFormat: 'pdf', pdfDateFilter }, logFn);
            if (pdfResult.metaTitle) {
                pdfContentBase64 = pdfResult.pdfBase64;
                pdfDownloadLink = pdfResult.imageUrl; 
                pdfModelUsed = pdfResult.modelUsed;

                // CORREÇÃO DE DUPLICIDADE DE LINKS:
                // Removemos a instrução para a IA colocar o link.
                // Dizemos apenas para citar o documento.
                extraContext = `
                ### DOCUMENTO DE REFERÊNCIA (${pdfDateFilter}+) ###
                Título: "${pdfResult.metaTitle}"
                Fonte: ${pdfModelUsed}
                
                INSTRUÇÃO CRÍTICA:
                1. Analise o documento anexo.
                2. Escreva um post técnico sobre ele.
                3. Cite o título do estudo.
                4. NÃO COLOQUE O LINK DE DOWNLOAD NO SEU TEXTO. O sistema fará isso automaticamente no final.
                `;
            }
        } catch (e) {
            console.warn(`⚠️ Falha busca PDF: ${e.message}`);
            if (logFn) await logFn('warn', `Falha busca PDF`, e.message);
        }
    }

    // GERAÇÃO DE TEXTO
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const textModel = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-2.5-flash" });
    const templateBase = targetStrategy.template || settings.promptTemplate || "Crie um post profissional.";
    const finalPrompt = `
    ${templateBase}
    TÓPICO: "${randomTopic}"
    ${extraContext}
    CONTEXTO: "${randomContext}"
    IDIOMA: ${settings.language === 'pt-BR' ? "Portuguese (Brazil)" : "English"}
    OUTPUT FORMAT (JSON): { "content": "...", "imagePrompt": "..." }
    RULES: No markdown blocks.
    `;
    
    let postContent = { content: "", imagePrompt: "" };
    try {
        const parts = [{ text: finalPrompt }];
        if (pdfContentBase64) parts.push({ inlineData: { data: pdfContentBase64, mimeType: "application/pdf" } });
        
        const result = await textModel.generateContent(parts);
        const raw = result.response.text();
        const parsed = robustParse(raw);
        postContent.content = forceCleanText(parsed.content || raw);
        
        // INJEÇÃO DO LINK ÚNICO E CORRETO
        // Somente aqui o link é adicionado.
        if (pdfDownloadLink && !postContent.content.includes(pdfDownloadLink)) {
            postContent.content += `\n\n📄 Leia o estudo completo aqui: ${pdfDownloadLink}`;
        }

        postContent.imagePrompt = parsed.imagePrompt || `Professional photo about ${randomTopic}`;
    } catch (e) {
        // Retry sem anexo se estourar limite
        if (e.message.includes("413")) {
            const r = await textModel.generateContent(finalPrompt);
            const p = robustParse(r.response.text());
            postContent.content = forceCleanText(p.content || r.response.text());
            if (pdfDownloadLink) postContent.content += `\n\n📄 Link: ${pdfDownloadLink}`;
        } else {
            if(logFn) await logFn('error', 'Erro Texto Gemini', e.message);
            throw e;
        }
    }

    // GERAÇÃO DE IMAGEM (GARANTIA DE FALLBACK)
    let finalMediaData = { imageUrl: '', modelUsed: 'None' };
    try {
        // Força o formato 'image' para garantir que o mediaHandler use o fluxo de imagem
        // Mantém as chaves do settings (imageProvider, geminiApiKey) para o fallback funcionar
        const imageSettings = { 
            ...settings, 
            activeFormat: 'image',
            forceImageGeneration: true // Flag extra de segurança
        };
        
        finalMediaData = await generateMedia(postContent.imagePrompt, imageSettings, logFn);
        finalMediaData.mediaType = 'image';
    } catch (e) { console.error("Erro imagem:", e); }

    return {
        topic: randomTopic,
        content: postContent.content,
        imagePrompt: postContent.imagePrompt,
        imageUrl: finalMediaData.imageUrl,
        modelUsed: isPdfMode ? `${pdfModelUsed} + ${finalMediaData.modelUsed}` : finalMediaData.modelUsed,
        mediaType: 'image', 
        originalPdfUrl: pdfDownloadLink, 
        manualRequired: false,
        metaIndexes: {
            topic: topicIndex + 1,
            context: contextIndex >= 0 ? contextIndex + 1 : null
        }
    };
}

module.exports = { generatePost };