const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require('firebase-admin');

// Helper para upload no Firebase Storage
// Agora aceita bucketName opcional
async function uploadImageToFirebase(base64Data, mimeType, bucketName) {
    try {
        // Se o bucketName vier preenchido, usa ele. Senão, usa o default do projeto.
        const bucket = admin.storage().bucket(bucketName || undefined);
        
        const fileName = `generated-images/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
        const file = bucket.file(fileName);
        
        const buffer = Buffer.from(base64Data, 'base64');
        
        await file.save(buffer, {
            metadata: { contentType: mimeType },
            public: true 
        });

        return file.publicUrl();
    } catch (error) {
        console.error("Erro no upload para o Storage:", error);
        // Dica de debug se der erro
        if (error.code === 404) {
            console.error("DICA: Verifique se o nome do Bucket em Settings está correto (sem gs://, apenas o dominio).");
        }
        throw new Error("Falha ao salvar imagem gerada.");
    }
}

async function generatePost(settings) {
    if (!settings.geminiApiKey) {
        console.error("Gemini API Key is missing");
        return null;
    }

    const pool = settings.topics && settings.topics.length > 0 ? settings.topics : settings.instagramTopics;
    if (!pool || pool.length === 0) {
        console.error("No topics configured");
        return null;
    }

    const randomTopic = pool[Math.floor(Math.random() * pool.length)];
    console.log(`🎲 Tópico sorteado: "${randomTopic}"`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    
    // 1. GERAÇÃO DE TEXTO
    const textModelName = settings.geminiModel || "gemini-1.5-flash";
    const textModel = genAI.getGenerativeModel({ model: textModelName });

    const languageInstruction = settings.language === 'pt-BR' ? "Write in Portuguese (Brazil)." : "Write in English.";
    const contextVal = settings.context || settings.instagramContext || "";
    const template = settings.promptTemplate || settings.instagramPromptTemplate || "Crie um post sobre {topic}";

    const prompt = `
    ${template}
    TOPIC: "${randomTopic}"
    CONTEXT: ${contextVal}
    ${languageInstruction}
    OUTPUT INSTRUCTIONS: JSON with keys 'content' and 'imagePrompt' (highly detailed visual description).
    Do not include markdown formatting like \`\`\`json.
    `;

    let postContent = {};
    
    try {
        const result = await textModel.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        // JSON Parse resiliente
        try {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                postContent = JSON.parse(text.substring(start, end + 1));
            } else {
                throw new Error("JSON brackets not found");
            }
        } catch (parseError) {
            console.error("JSON Parse failed:", parseError);
            postContent = { 
                content: text, 
                imagePrompt: `Professional photo of ${randomTopic}` 
            };
        }

    } catch (e) {
        console.error("Text Gen Error:", e);
        return null;
    }

    // 2. ESTRATÉGIA DE IMAGEM
    const imagePrompt = postContent.imagePrompt || `Professional photo of ${randomTopic}`;
    let finalImageUrl = "";

    const imageProvider = settings.imageProvider || "pollinations"; 

    if (imageProvider === 'imagen') {
        console.log("🎨 Gerando imagem com Google Imagen 3...");
        try {
            // Usa o modelo específico de imagem
            const imagenModel = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" });
            
            const result = await imagenModel.generateContent({
                contents: [{ role: "user", parts: [{ text: imagePrompt }] }]
            });

            // Tenta extrair o Base64 (Lógica adaptativa para diferentes versões da lib)
            const response = await result.response;
            
            // Nota: Se a lib oficial ainda não devolver inlineData facilmente,
            // cairemos no catch e usaremos o fallback do Pollinations.
            // Mas se devolver, fazemos o upload:
            if (response.candidates && response.candidates[0]?.content?.parts[0]?.inlineData) {
                const base64 = response.candidates[0].content.parts[0].inlineData.data;
                const mimeType = response.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';
                
                // UPLOAD PARA O FIREBASE STORAGE (Usando o bucket das configurações)
                finalImageUrl = await uploadImageToFirebase(base64, mimeType, settings.firebaseStorageBucket);
                console.log("✅ Imagem salva no Storage:", finalImageUrl);
            } else {
                throw new Error("Formato de resposta do Imagen não suportado pela lib atual.");
            }

        } catch (imgError) {
            console.warn("⚠️ Falha no Imagen 3 (Fallback para Pollinations):", imgError.message);
            const encoded = encodeURIComponent(imagePrompt);
            finalImageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.random()}`;
        }
    } else {
        // Padrão Pollinations (Flux)
        console.log("🎨 Gerando imagem com Pollinations (Flux)...");
        const encoded = encodeURIComponent(imagePrompt);
        finalImageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.floor(Math.random()*1000)}`;
    }

    return {
        topic: randomTopic,
        content: postContent.content,
        imagePrompt: imagePrompt,
        imageUrl: finalImageUrl
    };
}

module.exports = { generatePost };