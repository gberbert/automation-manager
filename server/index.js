const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const admin = require('firebase-admin');
const { generatePost } = require('./utils/gemini');
const { publishPost, uploadImageOnly } = require('./utils/linkedin'); // Importação atualizada
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Init
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { console.error(e); }
} else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) { console.warn("No local key"); }
}

if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin initialized");
}

const db = admin.firestore();

// --- NOVO ENDPOINT: UPLOAD DE IMAGEM SEPARADO ---
app.post('/api/upload-media', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).json({ error: "No image URL provided" });

        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return res.status(400).json({ error: "Settings not found" });

        const assetUrn = await uploadImageOnly(imageUrl, settingsDoc.data());
        res.json({ success: true, assetUrn });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- ENDPOINT ATUALIZADO: PUBLICAÇÃO ---
app.post('/api/publish-now/:postId', async (req, res) => {
    try {
        const { postId } = req.params;
        const { mediaAsset } = req.body; // Recebe o asset se houver

        const settingsDoc = await db.collection('settings').doc('global').get();
        const postDoc = await db.collection('posts').doc(postId).get();

        if (!postDoc.exists) return res.status(404).json({ error: "Post not found" });

        // Passa o mediaAsset para a função de publicação
        const success = await publishPost(postDoc.data(), settingsDoc.data(), mediaAsset);

        if (success) {
            await db.collection('posts').doc(postId).update({
                status: 'published',
                publishedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.json({ success: true });
        } else {
            res.status(500).json({ error: "Failed to publish" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ... (Mantenha o resto do arquivo: Cron, Auth Callback, Generate, etc. igual estava) ...
// Vou incluir o final resumido para garantir que não quebre:

app.post('/api/generate-content', async (req, res) => {
    // ... (Lógica de geração igual)
    try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return res.status(400).json({ error: "No settings" });
        const result = await generatePost(settingsDoc.data());
        if (result) res.json({ success: true, post: result });
        else res.status(500).json({ error: "Generation failed" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/linkedin/callback', async (req, res) => {
    // ... (Lógica de auth igual, não muda nada aqui)
    // Se quiser eu colo o bloco inteiro, mas o foco é o upload.
    // Mantenha o código de Auth que já estava funcionando!
    const { code } = req.query;
    if (!code) return res.status(400).send('No code');
    
    try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.data() || {};
        
        const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
                grant_type: 'authorization_code',
                code,
                client_id: settings.linkedinClientId || process.env.LINKEDIN_CLIENT_ID,
                client_secret: settings.linkedinClientSecret || process.env.LINKEDIN_CLIENT_SECRET,
                redirect_uri: settings.linkedinRedirectUri || 'http://localhost:3000/auth/linkedin/callback'
            },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        await db.collection('settings').doc('global').set({
            linkedinAccessToken: tokenResponse.data.access_token
        }, { merge: true });

        res.send('<html><body><h1>✅ LinkedIn Connected!</h1><script>setTimeout(()=>window.close(), 2000)</script></body></html>');
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
}

module.exports = app;