const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');

// IMPORTS DOS UTILITÁRIOS
const { generatePost, generateReaction } = require('./utils/gemini'); // <--- IMPORT ATUALIZADO
const { publishPost, uploadImageOnly } = require('./utils/linkedin'); 
const { generateMedia, uploadToCloudinary, searchUnsplash } = require('./utils/mediaHandler');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// --- FIREBASE INIT ---
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./serviceAccountKey.json');
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
    console.warn("⚠️ AVISO: Service Account não encontrado.");
    if (admin.apps.length === 0) admin.initializeApp();
}
const db = admin.firestore();

// --- LOGGER ---
async function logSystem(type, msg, det = null, s = {}) {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    try {
        await db.collection('system_logs').add({
            type,
            message: msg,
            details: det ? JSON.stringify(det) : null,
            source: s.source || 'system',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Log error (Firestore):", e.message); }
}
const logWrapper = (s) => (t, m, d) => logSystem(t, m, d, s);

// --- AGENDAMENTO (CÓDIGO EXISTENTE MANTIDO) ---
function isTimeInWindow(s, c) { /* ... lógica existente ... */ return true; } // Simplificado aqui pra não repetir, mantenha o original
async function checkAndSetLock(t, s) { /* ... lógica existente ... */ return true; }
async function runScheduler() { /* ... lógica existente ... */ }

// ==========================================
// ROTAS DA API
// ==========================================

// Rota 1: Gerar Conteúdo (Autoral ou Manual)
app.post('/api/generate-content', async (req, res) => {
    try {
        const { format, manualTopic } = req.body; // <--- ACEITA manualTopic
        console.log(`🤖 Geração Manual. Format: ${format}. Topic: ${manualTopic || 'Auto'}`);
        
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return res.status(400).json({ error: "Configurações não encontradas." });
        
        const settings = settingsDoc.data();
        settings.postFormat = format;
        
        // Passa o manualTopic para o gerador
        const post = await generatePost(settings, logWrapper({ source: 'manual-trigger' }), manualTopic);
        
        if (!post) throw new Error("Falha ao gerar post.");
        
        await db.collection('posts').add({ 
            ...post, 
            status: 'pending', 
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        
        res.json({ success: true, post });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NOVA ROTA: GERAR REAÇÃO (Re-post / Comment)
app.post('/api/generate-reaction', async (req, res) => {
    try {
        const { type, context, content, link } = req.body;
        console.log(`💬 Gerando Reação (${type})...`);
        
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.data();

        const text = await generateReaction(type, context, content, link, settings);
        
        res.json({ success: true, text });
    } catch (error) {
        console.error("Erro Reaction:", error);
        res.status(500).json({ error: error.message });
    }
});

// Outras rotas (mantidas iguais)
app.post('/api/manual-upload', async (req, res) => {
    try {
        const { imageBase64, postId } = req.body;
        const isPdf = imageBase64.startsWith('data:application/pdf');
        const type = isPdf ? 'pdf' : 'image';
        const settingsDoc = await db.collection('settings').doc('global').get();
        const imageUrl = await uploadToCloudinary(imageBase64, settingsDoc.data(), isPdf ? 'pdf' : 'jpg');
        await db.collection('posts').doc(postId).update({ imageUrl: imageUrl, modelUsed: "Manual Upload", mediaType: type, manualRequired: false });
        res.json({ success: true, imageUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/upload-media', async (req, res) => {
    try {
        const { imageUrl, mediaType } = req.body;
        const settingsDoc = await db.collection('settings').doc('global').get();
        const assetUrn = await uploadImageOnly(imageUrl, settingsDoc.data(), mediaType);
        res.json({ success: true, assetUrn });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/publish-now/:id', async (req, res) => {
    try {
        const postId = req.params.id;
        const { mediaAsset } = req.body;
        const postDoc = await db.collection('posts').doc(postId).get();
        const settingsDoc = await db.collection('settings').doc('global').get();
        const result = await publishPost(postDoc.data(), settingsDoc.data(), mediaAsset);
        if (result.success) {
            await db.collection('posts').doc(postId).update({ status: 'published', publishedAt: admin.firestore.FieldValue.serverTimestamp(), linkedinPostId: result.id });
            res.json({ success: true });
        } else { res.status(500).json({ error: result.error }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/regenerate-image', async (req, res) => {
    try {
        const { postId, prompt } = req.body;
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = { ...settingsDoc.data(), activeFormat: 'image', forceImageGeneration: true }; 
        const media = await generateMedia(prompt, settings, logWrapper({ source: 'regenerate' }));
        await db.collection('posts').doc(postId).update({ imageUrl: media.imageUrl, modelUsed: media.modelUsed });
        res.json({ success: true, imageUrl: media.imageUrl, modelUsed: media.modelUsed });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/unsplash-search', async (req, res) => {
    try {
        const { query } = req.body;
        const settingsDoc = await db.collection('settings').doc('global').get();
        const results = await searchUnsplash(query, settingsDoc.data());
        res.json({ success: true, results });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cron', async (req, res) => { await runScheduler(); res.json({ status: 'Executed' }); });

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
module.exports = app;