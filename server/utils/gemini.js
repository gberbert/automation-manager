const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generatePost(settings) {
    if (!settings.geminiApiKey) {
        console.error("Gemini API Key is missing");
        return null;
    }

    // Verifica se há tópicos do LinkedIn ou Instagram (Generic pool)
    const pool = settings.topics && settings.topics.length > 0 ? settings.topics : settings.instagramTopics;
    
    if (!pool || pool.length === 0) {
        console.error("No topics configured in any pool");
        return null;
    }

    // 1. SORTEIO
    const randomTopic = pool[Math.floor(Math.random() * pool.length)];
    console.log(`🎲 Tópico sorteado: "${randomTopic}"`);

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    
    // --- MODELO DINÂMICO ---
    // Usa o modelo escolhido pelo usuário ou o padrão estável
    const modelName = settings.geminiModel || "gemini-1.5-flash";
    console.log(`🧠 Usando modelo: ${modelName}`);
    
    const model = genAI.getGenerativeModel({ model: modelName });

    const languageInstruction = settings.language === 'pt-BR'
        ? "Write the post in Portuguese (Brazil)."
        : "Write the post in English.";

    // 2. CONTEXTO (Usa o do LinkedIn ou Instagram dependendo de qual estiver preenchido, ou ambos)
    const contextVal = settings.context || settings.instagramContext || "";
    const contextPart = contextVal ? `\n\nCONTEXTO/INSTRUÇÕES ADICIONAIS:\n${contextVal}` : "";

    // 3. PROMPT BASE (Usa o padrão ou do Instagram)
    const template = settings.promptTemplate || settings.instagramPromptTemplate || "Crie um post sobre {topic}";

    const finalPrompt = `
    ${template}

    TÓPICO ESPECÍFICO DESTE POST:
    "${randomTopic}"
    ${contextPart}

    ${languageInstruction}
    
    OUTPUT INSTRUCTIONS:
    Provide a JSON response with keys: 'content' (the post text) and 'imagePrompt' (description for an image).
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
        console.error(`Gemini generation error (${modelName}):`, error.message);
        return null;
    }
}

module.exports = { generatePost };