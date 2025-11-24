const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generatePost(settings) {
    if (!settings.geminiApiKey) {
        console.error("Gemini API Key is missing");
        return null;
    }

    if (!settings.topics || settings.topics.length === 0) {
        console.error("No topics configured");
        return null;
    }

    // Pick a random topic
    const topic = settings.topics[Math.floor(Math.random() * settings.topics.length)];

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const languageInstruction = settings.language === 'pt-BR'
        ? "Write the post in Portuguese (Brazil)."
        : "Write the post in English.";

    const prompt = settings.promptTemplate.replace('{topic}', topic) +
        `\n\n${languageInstruction} Also provide a short description for an image that would go well with this post. Return the response in JSON format with keys: 'content' and 'imagePrompt'.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up markdown code blocks if present
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let data;
        try {
            // Try to find the first '{' and last '}' to extract JSON
            const firstOpen = text.indexOf('{');
            const lastClose = text.lastIndexOf('}');
            if (firstOpen !== -1 && lastClose !== -1) {
                const jsonStr = text.substring(firstOpen, lastClose + 1);
                data = JSON.parse(jsonStr);
            } else {
                throw new Error("No JSON found");
            }
        } catch (e) {
            console.error("Failed to parse JSON from Gemini response", text);
            // Fallback: treat the whole text as content
            data = {
                content: text,
                imagePrompt: "Professional business workspace with technology"
            };
        }

        // Use Pollinations.ai to generate an actual AI image based on the prompt
        const imagePrompt = data.imagePrompt || "Professional business workspace with technology";
        const encodedPrompt = encodeURIComponent(imagePrompt);
        // Add a random seed to prevent caching of the same image for the same prompt
        const randomSeed = Math.floor(Math.random() * 1000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;

        return {
            topic,
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
