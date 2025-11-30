const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');
const { generatePost } = require('./utils/gemini');
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
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.warn("⚠️ Service Account não encontrado.");
    }
}

if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
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
    } catch (e) { console.error("Log error:", e.message); }
}
const logWrapper = (s) => (t, m, d) => logSystem(t, m, d, s);
// ==========================================
// 🧠 HELPERS DE AGENDAMENTO
// ==========================================

function isTimeInWindow(scheduledTime, currentTimeStr) {
    if (!scheduledTime || !currentTimeStr) return false;
    const toMinutes = (str) => { const [h, m] = str.split(':').map(Number); return h * 60 + m; };
    const schedM = toMinutes(scheduledTime);
    const currM = toMinutes(currentTimeStr);
    const diff = currM - schedM;
    // Janela de 20 minutos
    if (diff >= 0 && diff < 20) return true;
    const diffDay = (currM + 1440) - schedM;
    if (diffDay >= 0 && diffDay < 20) return true;
    return false;
}

// --- TRAVA DIÁRIA ---
async function checkAndSetLock(type, scheduledTime) {
    const today = new Date().toISOString().split('T')[0];
    const lockId = `lock_${today}_${type}_${scheduledTime}`;
    const lockRef = db.collection('scheduler_locks').doc(lockId);
    
    try {
        const doc = await lockRef.get();
        if (doc.exists) {
            console.log(`🔒 Trava encontrada: ${lockId}. Já executado hoje.`);
            return false;
        }
        await lockRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), type, scheduledTime });
        return true;
    } catch (e) {
        console.error("Erro trava:", e);
        return false;
    }
}

// ==========================================
// SCHEDULER
// ==========================================
async function runScheduler() {
    console.log("⏰ Rodando Scheduler...");
    
    const settingsDoc = await db.collection('settings').doc('global').get();
    if (!settingsDoc.exists) return console.log("Configurações não encontradas.");
    const settings = settingsDoc.data();

    const now = new Date();
    const brazilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHM = brazilTime.getHours().toString().padStart(2, '0') + ':' + 
                      brazilTime.getMinutes().toString().padStart(2, '0');
    console.log(`🕒 Hora Brasil: ${currentHM}`);

    // --- 1. CRIAÇÃO ---
    const creation = settings.scheduler?.creation;
    if (creation && creation.enabled) {
        const executeGeneration = async (blockSettings, format, sourceName, lockType) => {
            if (blockSettings.enabled && isTimeInWindow(blockSettings.time, currentHM)) {
                const canRun = await checkAndSetLock(lockType, blockSettings.time);
                if (canRun) {
                    console.log(`🚀 Disparando Criação (${sourceName})`);
                    const runSettings = { ...settings, postFormat: format };
                    for(let i=0; i < (blockSettings.count || 1); i++) {
                        try {
                            const postData = await generatePost(runSettings, logWrapper({ source: sourceName }));
                            if (postData) {
                                await db.collection('posts').add({
                                    ...postData,
                                    status: 'pending',
                                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                    platform: 'linkedin',
                                    generatedBy: 'scheduler'
                                });
                                logSystem('success', `Post agendado criado (${format})`, postData.topic);
                            }
                        } catch (err) { logSystem('error', `Falha Scheduler (${format})`, err.message);
                        }
                    }
                }
            }
        };
        const imgBlock = creation.linkedin_image || creation.linkedin; 
        if (imgBlock) await executeGeneration(imgBlock, 'image', 'cron-image', 'linkedin_image');
        const pdfBlock = creation.linkedin_pdf;
        if (pdfBlock) await executeGeneration(pdfBlock, 'pdf', 'cron-pdf', 'linkedin_pdf');
    }

    // --- 2. PUBLICAÇÃO (CORRIGIDA) ---
    const pub = settings.scheduler?.publishing;
    if (pub && pub.enabled) {
        const slot = pub.slots.find(s => s.enabled && isTimeInWindow(s.time, currentHM));
        if (slot) {
            const canPub = await checkAndSetLock('publishing_slot', slot.time);
            if (canPub) {
                console.log(`🚀 Disparando Publicação (Slot ${slot.id})...`);
                const q = await db.collection('posts')
                    .where('status', '==', 'approved')
                    .orderBy('createdAt', 'asc')
                    .limit(slot.count)
                    .get();
                if (q.empty) {
                    console.log("📭 Fila vazia.");
                } else {
                    for (const doc of q.docs) {
                        const postData = doc.data();
                        console.log(`📤 Processando post ${doc.id}...`);
                        
                        let assetUrn = null;

                        // --- CORREÇÃO CRÍTICA: UPLOAD ANTES DE PUBLICAR ---
                        // O agendador precisa subir o arquivo para o LinkedIn igual o humano faz
                        if (postData.imageUrl) {
                            try {
                                console.log(`🔄 [Scheduler] Subindo mídia para LinkedIn antes de publicar...`);
                                // Usa a mesma função que o frontend usa
                                assetUrn = await uploadImageOnly(
                                    postData.imageUrl, 
                                    settings, 
                                    postData.mediaType
                                );
                                console.log(`✅ [Scheduler] Asset criado: ${assetUrn}`);
                            } catch (uploadErr) {
                                console.error(`❌ [Scheduler] Falha no upload da imagem: ${uploadErr.message}`);
                                logSystem('error', `Falha Upload Asset (Scheduler)`, uploadErr.message);
                                // Se for PDF, aborta para não publicar link quebrado.
                                // Se for imagem, tenta publicar assim mesmo (vai virar link).
                                if (postData.mediaType === 'pdf') continue;
                            }
                        }

                        // Agora chamamos o publishPost passando o assetUrn
                        const result = await publishPost(postData, settings, assetUrn);
                        if (result.success) {
                            await db.collection('posts').doc(doc.id).update({
                                status: 'published',
                                publishedAt: admin.firestore.FieldValue.serverTimestamp(),
                                linkedinPostId: result.id
                            });
                            logSystem('success', `Post publicado automaticamente`, result.id);
                        } else {
                            logSystem('error', `Falha publicação automática`, result.error);
                        }
                    }
                }
            } else {
                console.log(`🔒 Publicação do slot ${slot.time} já processada.`);
            }
        }
    }
}

// ==========================================
// ROTAS DA API
// ==========================================

app.post('/api/generate-content', async (req, res) => {
    try {
        const { format } = req.body;
        console.log(`🤖 Solicitando geração via Dashboard. Formato: ${format}`);
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return res.status(400).json({ error: "Configurações não encontradas." });
        const settings = settingsDoc.data();
       
        settings.postFormat = format;
        const post = await generatePost(settings, logWrapper({ source: 'manual-trigger' }));
        if (!post) throw new Error("Falha ao gerar post.");
        await db.collection('posts').add({ ...post, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() });
        res.json({ success: true, post });
    } catch (error) {
        console.error("Erro:", error);
        res.status(500).json({ error: error.message });
    }
});

// Outras rotas...
app.post('/api/manual-upload', async (req, res) => {
    try {
        const { imageBase64, postId } = req.body;
        if (!imageBase64 || !postId) return res.status(400).json({ error: "Dados incompletos" });
        const isPdf = imageBase64.startsWith('data:application/pdf');
        const type = isPdf ? 'pdf' : 'image';
        const settingsDoc = await db.collection('settings').doc('global').get();
        const imageUrl = await uploadToCloudinary(imageBase64, settingsDoc.data(), isPdf ? 'pdf' : 'jpg');
        await db.collection('posts').doc(postId).update({ imageUrl: imageUrl, modelUsed: "Manual Upload", mediaType: type, manualRequired: false });
        res.json({ success: true, imageUrl });
    } catch (error) { res.status(500).json({ error: error.message }); }
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
        console.log("[DEBUG] 🔄 Recebida solicitação de regeneração de imagem...");
        const { postId, prompt } = req.body;
        console.log(`[DEBUG] 🆔 PostID: ${postId}`);
        
        const settingsDoc = await db.collection('settings').doc('global').get();
        
        // --- GARANTIA DE PARIDADE COM O GERADOR PRINCIPAL ---
        const settings = { 
            ...settingsDoc.data(), 
            activeFormat: 'image',
            forceImageGeneration: true // Força o mediaHandler a usar lógica de imagem
        }; 
        
        const media = await generateMedia(prompt, settings, logWrapper({ source: 'regenerate' }));
        await db.collection('posts').doc(postId).update({ imageUrl: media.imageUrl, modelUsed: media.modelUsed });
        
        console.log("[DEBUG] ✅ Regeneração concluída com sucesso!");
        res.json({ success: true, imageUrl: media.imageUrl, modelUsed: media.modelUsed });
  
    } catch (e) { 
        console.error("[DEBUG] ❌ Erro na rota de regeneração:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});
app.post('/api/unsplash-search', async (req, res) => {
    try {
        const { query } = req.body;
        const settingsDoc = await db.collection('settings').doc('global').get();
        const results = await searchUnsplash(query, settingsDoc.data());
        res.json({ success: true, results });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cron', async (req, res) => {
    await runScheduler();
    res.json({ status: 'Executed' });
});

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
module.exports = app;