const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateMedia } = require('./mediaHandler');

// --- FAXINA PESADA ---
function forceCleanText(text) {
    if (!text) return "";
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (clean.startsWith('{')) clean = clean.substring(1);
    if (clean.endsWith('}')) clean = clean.substring(0, clean.length - 1);
    clean = clean.replace(/"content"\s*:\s*"/i, '').replace(/"content"\s*:\s*`/i, '');
    const imagePromptIndex = clean.search(/",\s*"imagePrompt"/i);
    if (imagePromptIndex !== -1) clean = clean.substring(0, imagePromptIndex);
    
    // Limpeza de links alucinados pela IA
    clean = clean.replace(/Link: http\S+/gi, '')
                 .replace(/Download: http\S+/gi, '')
                 .replace(/Source: http\S+/gi, '');
                 
    return clean.replace(/"\s*$/, '').replace(/`\s*$/, '').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\"/g, '"').trim();
}

// --- PARSER ROBUSTO ---
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
    
    // 1. SORTEIO DE TÓPICO
    const topicIndex = Math.floor(Math.random() * pool.length);
    const randomTopic = pool[topicIndex];
    
    // 2. SORTEIO DE CONTEXTO (COM SUPORTE A OBJETO VISUAL)
    const contextPool = targetStrategy.contexts || settings.contexts || [];
    let randomContextText = "";
    let linkedImageContext = ""; // O detalhe visual (ex: Logo NTT DATA)
    let contextIndex = -1;
    
    if (contextPool.length > 0) {
        contextIndex = Math.floor(Math.random() * contextPool.length);
        const selectedContext = contextPool[contextIndex];
        
        // Lógica Híbrida: Suporta String antiga ou Objeto novo {text, imageContext}
        if (typeof selectedContext === 'string') {
            randomContextText = selectedContext;
            linkedImageContext = "";
        } else {
            randomContextText = selectedContext.text || "";
            linkedImageContext = selectedContext.imageContext || "";
        }
    }

    console.log(`🎲 Tópico #${topicIndex + 1}: "${randomTopic}"`);
    console.log(`🎭 Contexto #${contextIndex + 1}: "${randomContextText.substring(0, 30)}..."`);
    if (linkedImageContext) console.log(`🎨 Contexto Visual Aplicado: "${linkedImageContext.substring(0, 30)}..."`);

    const pdfDateFilter = settings.strategyPdf?.dateFilter || '2024';
    let pdfContentBase64 = null;
    let pdfDownloadLink = "";
    let extraContext = "";
    let pdfModelUsed = "";

    // --- MODO PDF ---
    if (isPdfMode) {
        try {
            console.log("🧠 Simplificando tópico (JSON Mode)...");
            const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
            const m = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            
            const t = await m.generateContent(`
                You are a Search Engine Optimizer.
                Task: Convert the complex topic "${randomTopic}" into a simple keyword string for ArXiv/PubMed.
                Output Format (JSON ONLY): { "keywords": "term1 term2 term3" }
                Rules: Max 4 keywords. English only. No conversational text.
            `);
            
            let simplifiedQuery = "";
            try {
                const jsonResp = JSON.parse(t.response.text().replace(/```json|```/g, '').trim());
                simplifiedQuery = jsonResp.keywords;
            } catch (e) {
                simplifiedQuery = t.response.text().trim();
            }
            
            console.log(`🔍 Query Limpa: "${simplifiedQuery}"`);
            
            const pdfResult = await generateMedia(simplifiedQuery, { ...settings, activeFormat: 'pdf', pdfDateFilter }, logFn);
            
            if (pdfResult.metaTitle) {
                pdfContentBase64 = pdfResult.pdfBase64;
                pdfDownloadLink = pdfResult.imageUrl; 
                pdfModelUsed = pdfResult.modelUsed;

                extraContext = `
                ### DOCUMENTO DE REFERÊNCIA (${pdfDateFilter}+) ###
                Título: "${pdfResult.metaTitle}"
                Fonte: ${pdfModelUsed}
                
                INSTRUÇÃO: Escreva uma análise técnica sobre este estudo.
                `;
            }
        } catch (e) {
            console.warn(`⚠️ Falha busca PDF: ${e.message}`);
            if (logFn) await logFn('warn', `Falha busca PDF`, e.message);
        }
    }

    // --- GERAÇÃO DE TEXTO ---
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const textModel = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-2.5-flash" });
    const templateBase = targetStrategy.template || settings.promptTemplate || "Crie um post profissional.";

    const finalPrompt = `
    ${templateBase}
    TÓPICO: "${randomTopic}"
    ${extraContext}
    CONTEXTO: "${randomContextText}"
    IDIOMA: ${settings.language === 'pt-BR' ? "Portuguese (Brazil)" : "English"}
    OUTPUT FORMAT (JSON): { "content": "...", "imagePrompt": "..." }
    RULES: No markdown.
    `;
    
    let postContent = { content: "", imagePrompt: "" };
    
    try {
        const parts = [{ text: finalPrompt }];
        if (pdfContentBase64) parts.push({ inlineData: { data: pdfContentBase64, mimeType: "application/pdf" } });
        
        const result = await textModel.generateContent(parts);
        const raw = result.response.text();
        const parsed = robustParse(raw);
        postContent.content = forceCleanText(parsed.content || raw);
        
        if (pdfDownloadLink && !postContent.content.includes(pdfDownloadLink)) {
            postContent.content += `\n\n📄 Leia o estudo completo aqui: ${pdfDownloadLink}`;
        }

        // Validação e Montagem do Prompt de Imagem
        let rawPrompt = parsed.imagePrompt || "";
        if (rawPrompt.length < 5 || rawPrompt.length > 500) {
            rawPrompt = `Professional photo about ${randomTopic}, corporate style, high quality`;
        }

        // *** AQUI ESTÁ A CORREÇÃO PRINCIPAL ***
        // Anexa o contexto visual (se existir) ao prompt da imagem
        if (linkedImageContext) {
            rawPrompt += `. MANDATORY VISUAL DETAILS: ${linkedImageContext}`;
        }
        
        postContent.imagePrompt = rawPrompt;

    } catch (e) {
        if (e.message.includes("413")) {
            // Retry sem PDF se for muito grande
            const r = await textModel.generateContent(finalPrompt);
            const p = robustParse(r.response.text());
            postContent.content = forceCleanText(p.content || r.response.text());
            
            if (pdfDownloadLink) postContent.content += `\n\n📄 Link: ${pdfDownloadLink}`;
            
            // Garante prompt de imagem no retry
            postContent.imagePrompt = `Professional photo about ${randomTopic}`;
            if (linkedImageContext) postContent.imagePrompt += `. MANDATORY VISUAL DETAILS: ${linkedImageContext}`;

        } else {
            if(logFn) await logFn('error', 'Erro Texto Gemini', e.message);
            throw e;
        }
    }

    // --- GERAÇÃO DE IMAGEM ---
    let finalMediaData = { imageUrl: '', modelUsed: 'None' };
    try {
        console.log(`🎨 Gerando Imagem... Prompt Final: "${postContent.imagePrompt.substring(0, 60)}..."`);
        const imageSettings = { ...settings, activeFormat: 'image' }; 
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