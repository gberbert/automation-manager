const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateMedia } = require('./mediaHandler');
const admin = require('firebase-admin'); // Necessário para marcar o tópico no banco

function forceCleanText(text) {
    if (!text) return "";
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // Limpeza de JSON wrappers
    if (clean.startsWith('{')) clean = clean.substring(1);
    if (clean.endsWith('}')) clean = clean.substring(0, clean.length - 1);
    clean = clean.replace(/"content"\s*:\s*"/i, '').replace(/"content"\s*:\s*`/i, '');
    
    // Remove a parte do imagePrompt se vier colada
    const imagePromptIndex = clean.search(/",\s*"imagePrompt"/i);
    if (imagePromptIndex !== -1) clean = clean.substring(0, imagePromptIndex);
    
    // --- CORREÇÃO DO PLACEHOLDER ---
    // Remove trechos como [Link para o PDF...], [Inserir link], etc.
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

            // Helper para adicionar o alerta se não tiver
            const markList = (list) => {
                if (!Array.isArray(list)) return list;
                return list.map(item => {
                    if (item === topic && !item.startsWith("⚠️")) {
                        return `⚠️ ${item}`;
                    }
                    return item;
                });
            };

            // Atualiza em todos os lugares possíveis
            let updates = {};
            
            // Estratégia PDF
            if (data.strategyPdf?.topics?.includes(topic)) {
                updates['strategyPdf.topics'] = markList(data.strategyPdf.topics);
            }
            
            // Estratégia Imagem
            if (data.strategyImage?.topics?.includes(topic)) {
                updates['strategyImage.topics'] = markList(data.strategyImage.topics);
            }

            // Fallback (lista raiz antiga)
            if (data.topics?.includes(topic)) {
                updates['topics'] = markList(data.topics);
            }

            if (Object.keys(updates).length > 0) {
                t.update(ref, updates);
                console.log(`[DB] ⚠️ Tópico marcado com alerta no Firestore: "${topic}"`);
            }
        });
    } catch (e) {
        console.error("Erro ao marcar tópico no banco:", e.message);
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
    
    // --- 1. SELEÇÃO DO TÓPICO ---
    const targetStrategy = isPdfMode ? settings.strategyPdf : settings.strategyImage;
    const pool = targetStrategy?.topics || settings.topics || [];
    
    // Filtra tópicos que já estão com erro para não insistir neles
    const validPool = pool.filter(t => !t.startsWith("⚠️"));

    if (!validPool || validPool.length === 0) {
        // Se só sobraram tópicos com erro, tenta usar todos, mas avisa
        if (pool.length > 0) {
            console.warn("⚠️ Pool só contém tópicos marcados com erro. Tentando um deles...");
        } else {
            throw new Error(`Pool de Tópicos vazio.`);
        }
    }
    
    const usePool = validPool.length > 0 ? validPool : pool;
    const topicIndex = Math.floor(Math.random() * usePool.length);
    const randomTopic = usePool[topicIndex];
    
    console.log(`🎲 Tópico selecionado: "${randomTopic}"`);

    // --- 2. SELEÇÃO DO CONTEXTO ---
    const contextPool = targetStrategy?.contexts || settings.contexts || [];
    let randomContext = "";
    let contextIndex = -1;
    if (contextPool.length > 0) {
        contextIndex = Math.floor(Math.random() * contextPool.length);
        const ctxItem = contextPool[contextIndex];
        randomContext = typeof ctxItem === 'object' ? ctxItem.text : ctxItem;
    }

    // --- 3. BUSCA DE MÍDIA (PDF ou IMAGEM) ---
    const pdfDateFilter = settings.strategyPdf?.dateFilter || '2024';
    let pdfContentBase64 = null;
    let pdfDownloadLink = "";
    let extraContext = "";
    let pdfModelUsed = "";

    if (isPdfMode) {
        try {
            console.log("🧠 Simplificando tópico para busca...");
            const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
            const m = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const t = await m.generateContent(`Task: Convert topic to SINGLE short string of keywords for academic search. Topic: "${randomTopic}". Output ONLY keywords.`);
            const simplifiedQuery = t.response.text().trim();
            
            // CHAMA O MEDIA HANDLER (Pode lançar erro PDF_NOT_FOUND)
            const pdfResult = await generateMedia(simplifiedQuery, { ...settings, activeFormat: 'pdf', pdfDateFilter }, logFn);
            
            // Se chegou aqui, temos PDF válido
            pdfContentBase64 = pdfResult.pdfBase64;
            pdfDownloadLink = pdfResult.imageUrl;
            pdfModelUsed = pdfResult.modelUsed;
            
            // --- CORREÇÃO NO PROMPT DE CONTEXTO ---
            extraContext = `
            ### DOCUMENTO DE REFERÊNCIA (${pdfDateFilter}+) ###
            Título: "${pdfResult.metaTitle}"
            Fonte: ${pdfModelUsed}
            
            INSTRUÇÃO CRÍTICA:
            1. Analise o documento anexo.
            2. Escreva um post técnico sobre ele.
            3. Cite o título do estudo.
            4. PROIBIDO: NUNCA escreva "[Link]", "[Link para o PDF]" ou qualquer placeholder.
            5. Apenas termine o texto convidando o leitor a acessar o material completo anexo. O sistema inserirá o link automaticamente.
            `;

        } catch (e) {
            // --- REGRA DE ABORTO DE POST ---
            if (e.message === "PDF_NOT_FOUND") {
                console.warn(`⛔ Tópico cancelado: "${randomTopic}" - Sem PDF.`);
                
                // 1. Marca no Banco de Dados
                await markTopicAsFailed(randomTopic);

                // 2. Loga no Sistema
                if (logFn) {
                    await logFn('warn', `⚠️ Tópico Marcado: ${randomTopic}`, `Nenhum PDF de ${pdfDateFilter}+ encontrado. O tópico foi marcado com ⚠️ para revisão.`);
                }
                
                return null; // Retorna NULL para não criar o post no banco
            }
            
            console.error("Erro desconhecido no fluxo PDF:", e);
            if(logFn) await logFn('error', `Erro Fluxo PDF`, e.message);
            return null;
        }
    }

    // --- 4. GERAÇÃO DE TEXTO DO POST ---
    
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const textModel = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-2.5-flash" });
    const templateBase = targetStrategy?.template || "Crie um post profissional.";
    
    const finalPrompt = `
    ${templateBase}
    TÓPICO: "${randomTopic}"
    ${extraContext}
    CONTEXTO: "${randomContext}"
    IDIOMA: ${settings.language === 'pt-BR' ? "Portuguese (Brazil)" : "English"}
    OUTPUT FORMAT (JSON): { "content": "...", "imagePrompt": "..." }
    RULES: No markdown blocks. NO PLACEHOLDERS LIKE [Link].
    `;
    
    let postContent = { content: "", imagePrompt: "" };
    try {
        const parts = [{ text: finalPrompt }];
        if (pdfContentBase64) parts.push({ inlineData: { data: pdfContentBase64, mimeType: "application/pdf" } });
        
        const result = await textModel.generateContent(parts);
        const parsed = robustParse(result.response.text());
        postContent.content = forceCleanText(parsed.content);
        
        if (pdfDownloadLink && !postContent.content.includes(pdfDownloadLink)) {
            postContent.content += `\n\n📄 Leia o estudo completo aqui: ${pdfDownloadLink}`;
        }
        postContent.imagePrompt = parsed.imagePrompt || `Professional photo about ${randomTopic}`;
    } catch (e) {
        if(logFn) await logFn('error', 'Erro Texto Gemini', e.message);
        return null;
    }

    // --- 5. GERAÇÃO DE IMAGEM (CAPA OU POST IMAGEM) ---
    let finalMediaData = { imageUrl: '', modelUsed: 'None' };
    try {
        const imageSettings = { 
            ...settings, 
            activeFormat: 'image',
            forceImageGeneration: true 
        };
        finalMediaData = await generateMedia(postContent.imagePrompt, imageSettings, logFn);
    } catch (e) { console.error("Erro imagem final:", e); }

    // --- CORREÇÃO DA TAG MEDIA TYPE ---
    const finalMediaType = (isPdfMode && pdfDownloadLink) ? 'pdf' : 'image';

    return {
        topic: randomTopic,
        content: postContent.content,
        imagePrompt: postContent.imagePrompt,
        imageUrl: finalMediaData.imageUrl, 
        modelUsed: isPdfMode ? `${pdfModelUsed} + ${finalMediaData.modelUsed}` : finalMediaData.modelUsed,
        mediaType: finalMediaType,
        originalPdfUrl: pdfDownloadLink, 
        manualRequired: false,
        metaIndexes: {
            topic: topicIndex + 1,
            context: contextIndex >= 0 ? contextIndex + 1 : null
        }
    };
}

module.exports = { generatePost };