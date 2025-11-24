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

    // 1. SORTEIO: Pega APENAS UM tópico do pool para este post
    const randomTopic = settings.topics[Math.floor(Math.random() * settings.topics.length)];
    console.log(`🎲 Tópico sorteado: "${randomTopic}"`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    
    // CORREÇÃO AQUI: Usando o nome específico da versão que não dá erro 404
    // Se 'gemini-1.5-flash' falhar, 'gemini-1.5-flash-latest' costuma resolver
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const languageInstruction = settings.language === 'pt-BR'
        ? "Write the post in Portuguese (Brazil)."
        : "Write the post in English.";

    // 2. CONTEXTO ADICIONAL (Se o usuário preencheu)
    const contextPart = settings.context 
        ? `\n\nCONTEXTO/INSTRUÇÕES ADICIONAIS:\n${settings.context}` 
        : "";

    // 3. MONTAGEM DO PROMPT FINAL
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

        // Limpeza de markdown
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
            // Fallback robusto
            data = {
                content: text,
                imagePrompt: `Professional illustration about ${randomTopic}`
            };
        }

        // Geração da Imagem via Pollinations
        const imagePrompt = data.imagePrompt || `Professional illustration about ${randomTopic}`;
        const encodedPrompt = encodeURIComponent(imagePrompt);
        const randomSeed = Math.floor(Math.random() * 1000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;

        return {
            topic: randomTopic, // Salva o tópico sorteado no post
            content: data.content,
            imagePrompt: imagePrompt,
            imageUrl: imageUrl
        };

    } catch (error) {
        console.error("Gemini generation error:", error);
        return null;
    }
}

module.exports = { generatePost };