const axios = require('axios');
const admin = require('firebase-admin');

// Inicializa para pegar a chave do banco
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function listAvailableModels() {
    try {
        console.log("🔍 Buscando API Key no banco de dados...");
        const doc = await db.collection('settings').doc('global').get();
        
        if (!doc.exists) {
            console.error("❌ Configurações não encontradas no Firebase.");
            return;
        }

        const apiKey = doc.data().geminiApiKey;
        if (!apiKey) {
            console.error("❌ Nenhuma API Key encontrada em Settings.");
            return;
        }

        console.log(`🔑 Chave encontrada: ${apiKey.substring(0, 5)}...`);
        console.log("📡 Consultando API do Google para listar modelos...");

        // Chama o endpoint listModels
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        console.log("\n✅ SUCESSO! A API respondeu. Aqui estão os modelos que sua chave pode usar:\n");
        
        const models = response.data.models;
        const availableNames = [];

        models.forEach(model => {
            // Filtra apenas modelos que geram conteúdo (exclui embedding)
            if (model.supportedGenerationMethods.includes("generateContent")) {
                console.log(`- ${model.name.replace('models/', '')} \t(${model.displayName})`);
                availableNames.push(model.name.replace('models/', ''));
            }
        });

        console.log("\n👉 SUGESTÃO: Copie um dos nomes acima e cole no campo 'Modelo' no seu site.");

    } catch (error) {
        console.error("\n❌ ERRO FATAL NA CHAVE OU API:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error("Detalhe:", JSON.stringify(error.response.data, null, 2));
            
            if (error.response.status === 400 && error.response.data.error.message.includes("API_KEY_INVALID")) {
                console.error("\n⚠️ DIAGNÓSTICO: Sua API Key é inválida ou foi deletada.");
            }
        } else {
            console.error(error.message);
        }
    }
}

listAvailableModels();