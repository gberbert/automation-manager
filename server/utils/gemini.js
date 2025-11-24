const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generatePost(settings) {
    if (!settings.geminiApiKey) {
        console.error("Gemini API Key is missing");
        return null;
    }

    if (!settings.topics || settings.topics.length === 0) {
        console.error("No topics configured in the pool");
        return null;
    }

    // 1. SORTEIO
    const randomTopic = settings.topics[Math.floor(Math.random() * settings.topics.length)];
    console.log(`🎲 Tópico sorteado: "${randomTopic}"`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    
    // --- CORREÇÃO DO MODELO ---
    // Usando o alias estável padrão.
    // Se der erro 503 (Overloaded), é momentâneo do Google, tente novamente em 1 min.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const languageInstruction = settings.language === 'pt-BR'
        ? "Write the post in Portuguese (Brazil)."
        : "Write the post in English.";

    // 2. CONTEXTO
    const contextPart = settings.context 
        ? `\n\nCONTEXTO/INSTRUÇÕES ADICIONAIS:\n${settings.context}` 
        : "";

    // 3. PROMPT
    const finalPrompt = `
    ${settings.promptTemplate}

    TÓPICO ESPECÍFICO DESTE POST:
    "${randomTopic}"
    ${contextPart}

    ${languageInstruction}
    
    OUTPUT INSTRUCTIONS:
    Provide a JSON response with keys: 'content' (the LinkedIn post text) and 'imagePrompt' (description for an image).
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
                imagePrompt: `Professional illustration about ${randomTopic}`
            };
        }

        const imagePrompt = data.imagePrompt || `Professional illustration about ${randomTopic}`;
        const encodedPrompt = encodeURIComponent(imagePrompt);
        const randomSeed = Math.floor(Math.random() * 1000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;

        return {
            topic: randomTopic,
            content: data.content,
            imagePrompt: imagePrompt,
            imageUrl: imageUrl
        };

    } catch (error) {
        // Log detalhado para sabermos se é 404 (nome errado) ou 503 (servidor cheio)
        console.error("Gemini generation error:", error.message);
        return null;
    }
}

module.exports = { generatePost };