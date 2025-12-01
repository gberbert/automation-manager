const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');

// IMPORTS DOS UTILITÁRIOS
const { generatePost, generateReaction } = require('./utils/gemini');
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
    console.warn("⚠️ AVISO: Service Account não encontrado. Firebase inativo.");
    if (admin.apps.length === 0) admin.initializeApp();
}

const db = admin.firestore();

// --- LOGGER ---
async function logSystem(type, msg, det = null, s = {}) {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${msg}`);
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

// ==========================================
// 🧠 HELPERS DE AGENDAMENTO
// ==========================================

function isTimeInWindow(scheduledTime, currentTimeStr) {
    if (!scheduledTime || !currentTimeStr) return false;
    
    const toMinutes = (str) => { 
        const [h, m] = str.split(':').map(Number); 
        return h * 60 + m; 
    };
    
    const schedM = toMinutes(scheduledTime);
    const currM = toMinutes(currentTimeStr);
    
    // Janela de 20 minutos (Permite que o cron atrase um pouco ou rode em intervalos de 5/10 min)
    const diff = currM - schedM;
    
    // Debug da lógica de tempo
    // console.log(`[TimeCheck] Agendado: ${schedM}min | Atual: ${currM}min | Diff: ${diff}`);

    if (diff >= 0 && diff <= 20) return true;
    
    // Tratamento para virada do dia (Ex: Agendado 23:55, Atual 00:05)
    const diffDay = (currM + 1440) - schedM;
    if (diffDay >= 0 && diffDay <= 20) return true;
    
    return false;
}

// --- TRAVA DIÁRIA ---
async function checkAndSetLock(type, scheduledTime) {
    const today = new Date().toLocaleString("en-CA", { timeZone: "America/Sao_Paulo" }).split(',')[0]; // Formato YYYY-MM-DD
    const lockId = `lock_${today}_${type}_${scheduledTime.replace(':','')}`;
    const lockRef = db.collection('scheduler_locks').doc(lockId);
    
    try {
        const doc = await lockRef.get();
        if (doc.exists) {
            console.log(`🔒 Trava existente: ${lockId} (Já executado hoje)`);
            return false;
        }
        // Cria a trava
        await lockRef.set({ 
            createdAt: admin.firestore.FieldValue.serverTimestamp(), 
            type, 
            scheduledTime,
            status: 'locked'
        });
        return true;
    } catch (e) {
        console.error("Erro trava:", e);
        return false;
    }
}

// ==========================================
// SCHEDULER (RODA A CADA CHECK DO UPTIMEROBOT)
// ==========================================
async function runScheduler() {
    console.log("⏰ --- INICIANDO VERIFICAÇÃO DO SCHEDULER ---");
    
    const settingsDoc = await db.collection('settings').doc('global').get();
    if (!settingsDoc.exists) return console.log("❌ Configurações não encontradas.");
    const settings = settingsDoc.data();

    // HORA BRASIL (CRÍTICO)
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHM = brazilTime.getHours().toString().padStart(2, '0') + ':' + 
                      brazilTime.getMinutes().toString().padStart(2, '0');
    
    console.log(`🕒 Hora Servidor (UTC): ${now.toISOString().substring(11,16)}`);
    console.log(`🇧🇷 Hora Brasil (Ref):   ${currentHM}`);

    // --- 1. CRIAÇÃO (AI) ---
    const creation = settings.scheduler?.creation;
    if (creation && creation.enabled) {
        
        const checkBlock = async (blockSettings, format, sourceName, lockType) => {
            if (!blockSettings.enabled) return;

            const isTime = isTimeInWindow(blockSettings.time, currentHM);
            console.log(`🔎 Check Criação [${sourceName}]: Agendado ${blockSettings.time} vs Atual ${currentHM} -> ${isTime ? '✅ HORA!' : '❌ Aguardando'}`);

            if (isTime) {
                const canRun = await checkAndSetLock(lockType, blockSettings.time);
                if (canRun) {
                    console.log(`🚀 DISPARANDO CRIAÇÃO: ${sourceName}`);
                    const runSettings = { ...settings, postFormat: format };
                    
                    // Executa a geração em background para não travar o loop
                    (async () => {
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
                                    logSystem('success', `Automação: Post criado (${format})`, postData.topic);
                                }
                            } catch (err) { 
                                logSystem('error', `Falha Automação (${format})`, err.message);
                            }
                        }
                    })();
                }
            }
        };

        const imgBlock = creation.linkedin_image || creation.linkedin; 
        if (imgBlock) await checkBlock(imgBlock, 'image', 'cron-image', 'linkedin_image');
        
        const pdfBlock = creation.linkedin_pdf;
        if (pdfBlock) await checkBlock(pdfBlock, 'pdf', 'cron-pdf', 'linkedin_pdf');

    } else {
        console.log("⏸️ Scheduler de Criação está DESATIVADO nas configurações.");
    }

    // --- 2. PUBLICAÇÃO (POSTAGEM) ---
    const pub = settings.scheduler?.publishing;
    if (pub && pub.enabled) {
        const activeSlots = pub.slots.filter(s => s.enabled);
        
        for (const slot of activeSlots) {
            const isTime = isTimeInWindow(slot.time, currentHM);
            console.log(`🔎 Check Publicação [Slot ${slot.id}]: Agendado ${slot.time} vs Atual ${currentHM} -> ${isTime ? '✅ HORA!' : '❌ Aguardando'}`);

            if (isTime) {
                const canPub = await checkAndSetLock('publishing_slot', slot.time);
                if (canPub) {
                    console.log(`🚀 DISPARANDO PUBLICAÇÃO (Slot ${slot.id})...`);
                    
                    // Busca posts aprovados (FIFO - Mais antigos primeiro)
                    const q = await db.collection('posts')
                        .where('status', '==', 'approved')
                        .orderBy('createdAt', 'asc') // Pega o mais antigo da fila
                        .limit(slot.count)
                        .get();
                    
                    if (q.empty) {
                        console.log("📭 Fila de aprovação vazia. Nada para publicar.");
                        logSystem('info', `Slot ${slot.time}: Fila vazia`, null);
                    } else {
                        // Executa publicação em background
                        (async () => {
                            for (const doc of q.docs) {
                                const postData = doc.data();
                                console.log(`📤 Publicando: ${postData.topic}`);
                                
                                let assetUrn = null;
                                if (postData.imageUrl) {
                                    try {
                                        assetUrn = await uploadImageOnly(postData.imageUrl, settings, postData.mediaType);
                                    } catch (uploadErr) {
                                        console.error(`Erro upload: ${uploadErr.message}`);
                                        if (postData.mediaType === 'pdf') continue; // Pula se PDF falhar
                                    }
                                }

                                const result = await publishPost(postData, settings, assetUrn);
                                if (result.success) {
                                    await db.collection('posts').doc(doc.id).update({
                                        status: 'published',
                                        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
                                        linkedinPostId: result.id
                                    });
                                    logSystem('success', `Publicado Automaticamente`, result.id);
                                } else {
                                    logSystem('error', `Falha Publicação Auto`, result.error);
                                }
                            }
                        })();
                    }
                }
            }
        }
    } else {
        console.log("⏸️ Scheduler de Publicação está DESATIVADO nas configurações.");
    }
    
    console.log("🏁 Verificação concluída.\n");
}

// ==========================================
// ROTAS DA API
// ==========================================

// Rota 1: Gerar Conteúdo (Autoral ou Manual)
app.post('/api/generate-content', async (req, res) => {
    try {
        const { format, manualTopic } = req.body;
        console.log(`🤖 Geração Manual. Format: ${format}. Topic: ${manualTopic || 'Auto'}`);
        
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return res.status(400).json({ error: "Configurações não encontradas." });
        
        const settings = settingsDoc.data();
        settings.postFormat = format;
        
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

// Outras rotas...
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

// Rota Cron (Chamada pelo UptimeRobot)
app.get('/api/cron', async (req, res) => {
    // Não usamos await aqui para não dar timeout no UptimeRobot
    runScheduler().catch(err => console.error("Erro Fatal Scheduler:", err));
    res.json({ status: 'Scheduler Triggered', timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
module.exports = app;
