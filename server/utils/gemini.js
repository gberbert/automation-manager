const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generatePost(settings) {
    if (!settings.geminiApiKey) {
        console.error("Gemini API Key is missing");
        return null;
    }

    // Pool logic...
    const pool = settings.topics && settings.topics.length > 0 ? settings.topics : settings.instagramTopics;
    if (!pool || pool.length === 0) {
        console.error("No topics configured");
        return null;
    }

    const randomTopic = pool[Math.floor(Math.random() * pool.length)];
    console.log(`🎲 Tópico sorteado: "${randomTopic}"`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    
    // Modelo de Texto (Mantemos o que funciona)
    const modelName = settings.geminiModel || "gemini-1.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const languageInstruction = settings.language === 'pt-BR'
        ? "Write the post in Portuguese (Brazil)."
        : "Write the post in English.";

    const contextVal = settings.context || settings.instagramContext || "";
    const contextPart = contextVal ? `\n\nCONTEXTO/INSTRUÇÕES ADICIONAIS:\n${contextVal}` : "";
    const template = settings.promptTemplate || settings.instagramPromptTemplate || "Crie um post sobre {topic}";

    // Prompt ajustado para pedir descrição visual melhor
    const finalPrompt = `
    ${template}

    TÓPICO ESPECÍFICO DESTE POST:
    "${randomTopic}"
    ${contextPart}

    ${languageInstruction}
    
    OUTPUT INSTRUCTIONS:
    Provide a JSON response with keys: 'content' (the post text) and 'imagePrompt' (description for an image).
    For 'imagePrompt', describe a highly photorealistic, cinematic, professional image suitable for LinkedIn business context. Avoid cartoons or abstract art descriptions unless requested.
    Do not include markdown formatting like \`\`\`json.
    `;

    try {
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        let text = response.text();

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let data;
        try {
            const firstOpen = text.indexOf('{');
            const lastClose = text.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1) {
                data = JSON.parse(text.substring(firstOpen, lastClose + 1));
            } else {
                throw new Error("No JSON found");
            }
        } catch (e) {
            console.error("JSON Parse failed:", text);
            data = {
                content: text,
                imagePrompt: `Professional office photography about ${randomTopic}, cinematic lighting, 4k`
            };
        }

        const imagePrompt = data.imagePrompt || `Professional office photography about ${randomTopic}, cinematic lighting, 4k`;
        const encodedPrompt = encodeURIComponent(imagePrompt);
        
        // --- O PULO DO GATO: USANDO O MODELO FLUX ---
        // Adicionamos &model=flux para ativar a geração fotorrealista de alta qualidade
        // Adicionamos seed aleatória para variar
        const randomSeed = Math.floor(Math.random() * 100000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${randomSeed}`;

        return {
            topic: randomTopic,
            content: data.content,
            imagePrompt: imagePrompt,
            imageUrl: imageUrl
        };

    } catch (error) {
        console.error(`Gemini generation error (${modelName}):`, error.message);
        return null;
    }
}

module.exports = { generatePost };