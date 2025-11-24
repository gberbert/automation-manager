const { GoogleGenerativeAI } = require("@google/generative-ai");
const cloudinary = require('cloudinary').v2;

async function uploadToCloudinary(base64Data, settings) {
    if (!settings.cloudinaryCloudName || !settings.cloudinaryApiKey || !settings.cloudinaryApiSecret) {
        throw new Error("Credenciais do Cloudinary não configuradas em Settings -> General.");
    }
    cloudinary.config({
        cloud_name: settings.cloudinaryCloudName,
        api_key: settings.cloudinaryApiKey,
        api_secret: settings.cloudinaryApiSecret
    });
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "automation_manager", resource_type: "image" },
            (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
        );
        const buffer = Buffer.from(base64Data, 'base64');
        uploadStream.end(buffer);
    });
}

async function generatePost(settings) {
    if (!settings.geminiApiKey) return null;

    const pool = settings.topics && settings.topics.length > 0 ? settings.topics : settings.instagramTopics;
    if (!pool || pool.length === 0) return null;

    const randomTopic = pool[Math.floor(Math.random() * pool.length)];
    console.log(`🎲 Tópico sorteado: "${randomTopic}"`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const textModelName = settings.geminiModel || "gemini-2.5-flash"; // Padrão atualizado
    const textModel = genAI.getGenerativeModel({ model: textModelName });

    const languageInstruction = settings.language === 'pt-BR' ? "Write in Portuguese (Brazil)." : "Write in English.";
    const contextVal = settings.context || settings.instagramContext || "";
    const template = settings.promptTemplate || settings.instagramPromptTemplate || "Crie um post sobre {topic}";

    const prompt = `
    ${template}
    TOPIC: "${randomTopic}"
    CONTEXT: ${contextVal}
    ${languageInstruction}
    OUTPUT INSTRUCTIONS: JSON with keys 'content' and 'imagePrompt' (highly detailed visual description). Do not include markdown.
    `;

    let postContent = {};
    try {
        const result = await textModel.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            postContent = JSON.parse(text.substring(start, end + 1));
        } else {
            postContent = { content: text, imagePrompt: `Photo of ${randomTopic}` };
        }
    } catch (e) {
        console.error("Text Gen Error:", e);
        return null;
    }

    // --- LÓGICA DE DECISÃO DE IMAGEM ---
    const imagePrompt = postContent.imagePrompt || `Professional photo of ${randomTopic}`;
    let finalImageUrl = "";
    const imageProvider = settings.imageProvider || "pollinations"; 

    if (imageProvider === 'imagen') {
        // 1. GOOGLE IMAGEN 3 + CLOUDINARY
        console.log("🎨 Gerando com Imagen 3...");
        try {
            const imagenModel = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" });
            const result = await imagenModel.generateContent({
                contents: [{ role: "user", parts: [{ text: imagePrompt }] }]
            });
            const response = await result.response;
            
            if (response.candidates && response.candidates[0]?.content?.parts[0]?.inlineData) {
                const base64 = response.candidates[0].content.parts[0].inlineData.data;
                finalImageUrl = await uploadToCloudinary(base64, settings);
                console.log("✅ Upload Cloudinary OK:", finalImageUrl);
            } else {
                throw new Error("API Imagen 3 não retornou inlineData.");
            }
        } catch (error) {
            console.warn(`⚠️ Imagen falhou (${error.message}), tentando Flux...`);
            // Fallback para Flux
            const encoded = encodeURIComponent(imagePrompt);
            finalImageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.random()}`;
        }

    } else if (imageProvider === 'flux') {
        // 2. POLLINATIONS FLUX (Realista)
        console.log("🎨 Gerando com Pollinations FLUX...");
        const encoded = encodeURIComponent(imagePrompt);
        finalImageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.floor(Math.random()*1000)}`;

    } else {
        // 3. POLLINATIONS STANDARD (Padrão)
        console.log("🎨 Gerando com Pollinations Standard...");
        const encoded = encodeURIComponent(imagePrompt);
        finalImageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random()*1000)}`;
    }

    return {
        topic: randomTopic,
        content: postContent.content,
        imagePrompt: imagePrompt,
        imageUrl: finalImageUrl
    };
}

module.exports = { generatePost };