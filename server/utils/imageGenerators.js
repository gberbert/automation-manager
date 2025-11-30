const axios = require('axios');

// 1. Google Gemini Image (REST API - generateContent)
// Simula o comportamento do Script PowerShell que funcionou
async function generateGeminiImage(prompt, apiKey) {
    const modelName = "gemini-3-pro-image-preview";
    console.log(`[DEBUG] 🔹 Tentando Google Model: ${modelName} (via generateContent)`);
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const body = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    try {
        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 45000
        });

        const candidate = response.data.candidates?.[0];
        const part = candidate?.content?.parts?.[0];
        
        if (part?.inlineData?.data) {
            console.log(`[DEBUG] ✅ Sucesso! Imagem gerada (${part.inlineData.data.length} bytes)`);
            return Buffer.from(part.inlineData.data, 'base64');
        } else if (part?.text) {
            throw new Error(`Modelo retornou texto: "${part.text.substring(0,50)}..."`);
        } else {
            throw new Error("Resposta da API vazia ou formato inesperado.");
        }

    } catch (error) {
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message;
        console.error(`[DEBUG] ❌ Erro API Gemini (${status}): ${msg}`);
        throw error;
    }
}

// 2. Pollinations (Flux) - Fallback
async function generatePollinationsImage(prompt) {
    console.log("[DEBUG] 🔹 Tentando Fallback: Pollinations (Flux)");
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.random()}`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 40000 });
    return Buffer.from(res.data);
}

module.exports = { generateGeminiImage, generatePollinationsImage };