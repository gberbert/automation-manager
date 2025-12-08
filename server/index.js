const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const path = require('path');

// IMPORTS DOS UTILITÁRIOS
const { generatePost, generateReaction, refineText } = require('./utils/gemini');
const { publishPost, uploadImageOnly, postComment, fetchComments, replyToComment } = require('./utils/linkedin');
const { generateMedia, uploadToCloudinary, searchUnsplash } = require('./utils/mediaHandler');
const { scrapeLinkedInComments } = require('./services/linkedinScraper');

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

    // Janela de 20 minutos
    const diff = currM - schedM;

    if (diff >= 0 && diff <= 20) return true;

    // Tratamento para virada do dia
    const diffDay = (currM + 1440) - schedM;
    if (diffDay >= 0 && diffDay <= 20) return true;

    return false;
}

// --- TRAVA DIÁRIA ---
async function checkAndSetLock(type, scheduledTime) {
    const today = new Date().toLocaleString("en-CA", { timeZone: "America/Sao_Paulo" }).split(',')[0];
    const lockId = `lock_${today}_${type}_${scheduledTime.replace(':', '')}`;
    const lockRef = db.collection('scheduler_locks').doc(lockId);

    try {
        const doc = await lockRef.get();
        if (doc.exists) {
            console.log(`🔒 Trava existente: ${lockId} (Já executado hoje)`);
            return false;
        }
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
// SCHEDULER
// ==========================================
async function runScheduler() {
    console.log("⏰ --- INICIANDO VERIFICAÇÃO DO SCHEDULER ---");

    const settingsDoc = await db.collection('settings').doc('global').get();
    if (!settingsDoc.exists) return console.log("❌ Configurações não encontradas.");
    const settings = settingsDoc.data();

    const now = new Date();
    const brazilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const currentHM = brazilTime.getHours().toString().padStart(2, '0') + ':' +
        brazilTime.getMinutes().toString().padStart(2, '0');

    console.log(`🕒 Hora Servidor (UTC): ${now.toISOString().substring(11, 16)}`);
    console.log(`🇧🇷 Hora Brasil (Ref):   ${currentHM}`);

    // --- 1. CRIAÇÃO (AI) ---
    const creation = settings.scheduler?.creation;
    if (creation && creation.enabled) {

        // Função auxiliar para processar blocos sequencialmente
        const checkBlock = async (blockSettings, format, sourceName, lockType) => {
            if (!blockSettings.enabled) return;

            const isTime = isTimeInWindow(blockSettings.time, currentHM);
            console.log(`🔎 Check Criação [${sourceName}]: Agendado ${blockSettings.time} vs Atual ${currentHM} -> ${isTime ? '✅ HORA!' : '❌ Aguardando'}`);

            if (isTime) {
                const canRun = await checkAndSetLock(lockType, blockSettings.time);
                if (canRun) {
                    console.log(`🚀 DISPARANDO CRIAÇÃO: ${sourceName}`);
                    const runSettings = { ...settings, postFormat: format };

                    // --- MUDANÇA CRÍTICA: AGORA USAMOS AWAIT ---
                    // Isso obriga o servidor a esperar o processo terminar antes de finalizar o request do Cron
                    for (let i = 0; i < (blockSettings.count || 1); i++) {
                        try {
                            console.log(`⏳ Iniciando geração item ${i + 1}/${blockSettings.count}...`);
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
                                console.log(`✅ Geração item ${i + 1} concluída com sucesso.`);
                            } else {
                                console.warn(`⚠️ Geração item ${i + 1} retornou nulo (Erro ou PDF não achado).`);
                            }
                        } catch (err) {
                            console.error(`❌ Erro fatal na geração: ${err.message}`);
                            logSystem('error', `Falha Automação (${format})`, err.message);
                        }
                    }
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

                    // BUSCA TODOS OS APROVADOS E ORDENA EM MEMÓRIA (Evita index errors)
                    const q = await db.collection('posts')
                        .where('status', '==', 'approved')
                        .get();

                    if (q.empty) {
                        console.log("📭 Fila de aprovação vazia. Nada para publicar.");
                    } else {
                        let allApproved = q.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));

                        // ORDENAÇÃO: 1. publicationOrder (asc), 2. createdAt (asc - mais antigo primeiro)
                        allApproved.sort((a, b) => {
                            const orderA = a.data.publicationOrder ?? 999999;
                            const orderB = b.data.publicationOrder ?? 999999;
                            if (orderA !== orderB) return orderA - orderB;
                            return (a.data.createdAt?.toMillis() || 0) - (b.data.createdAt?.toMillis() || 0);
                        });

                        // PEGA OS TOP N
                        const postsToPublish = allApproved.slice(0, slot.count);

                        // --- MUDANÇA CRÍTICA: AWAIT AQUI TAMBÉM ---
                        for (const item of postsToPublish) {
                            const postData = item.data;
                            const docRef = item.ref;
                            const docId = item.id;
                            console.log(`📤 Publicando: ${postData.topic}`);
                            console.log(`📤 Publicando: ${postData.topic}`);

                            let assetUrn = null;
                            if (postData.imageUrl) {
                                try {
                                    assetUrn = await uploadImageOnly(postData.imageUrl, settings, postData.mediaType);
                                } catch (uploadErr) {
                                    console.error(`Erro upload: ${uploadErr.message}`);
                                    if (postData.mediaType === 'pdf') continue;
                                }
                            }

                            const result = await publishPost(postData, settings, assetUrn);
                            if (result.success) {
                                if (postData.originalPdfUrl) {
                                    await postComment(result.id, `📄 Leia o estudo completo aqui: ${postData.originalPdfUrl}`, settings);
                                }
                                await docRef.update({
                                    status: 'published',
                                    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    linkedinPostId: result.id
                                });
                                logSystem('success', `Publicado Automaticamente`, result.id);
                            } else {
                                logSystem('error', `Falha Publicação Auto`, result.error);
                            }
                        }
                    }
                }
            }
        }
    } else {
        console.log("⏸️ Scheduler de Publicação está DESATIVADO nas configurações.");
    }

    // --- 3. MONITORAMENTO DE ENGAJAMENTO (NOVO) ---
    const engagement = settings.scheduler?.engagement;
    if (engagement && engagement.enabled) {
        const isTime = isTimeInWindow(engagement.time, currentHM);
        console.log(`🔎 Check Engajamento: Agendado ${engagement.time} vs Atual ${currentHM} -> ${isTime ? '✅ HORA!' : '❌ Aguardando'}`);

        if (isTime) {
            const canRun = await checkAndSetLock('engagement_monitor', engagement.time);
            if (canRun) {
                console.log(`🚀 DISPARANDO MONITORAMENTO DE ENGAJAMENTO...`);
                // Chama a função de sync internamente
                const limitPosts = engagement.monitorCount || 20;
                logSystem('info', `Iniciando varredura de comentários`, `Posts: ${limitPosts}`);

                try {
                    // Logic duplicated from /api/sync-comments to ensure standalone run
                    const postsSnap = await db.collection('posts')
                        .where('status', '==', 'published')
                        .orderBy('publishedAt', 'desc')
                        .limit(limitPosts)
                        .get();

                    let totalNew = 0;
                    for (const doc of postsSnap.docs) {
                        const p = doc.data();
                        if (!p.linkedinPostId) continue;

                        // ID no banco pode ser só numérico ou URN completa. fetchComments espera URN ou ID.
                        // O linkedin.js lida com ID numérico? O endpoint precisa de URN: urn:li:share:ID ou urn:li:ugcPost:ID
                        // O nosso "linkedinPostId" salvo geralmente é urn:li:share:123... se veio do result.id
                        // Vamos garantir.
                        const res = await fetchComments(p.linkedinPostId, settings);

                        if (res.success && res.comments) {
                            for (const c of res.comments) {
                                // Verifica duplicidade
                                const cRef = db.collection('comments').doc(c.id); // c.id é URN
                                const cDoc = await cRef.get();
                                if (!cDoc.exists) {
                                    await cRef.set({
                                        ...c,
                                        postDbId: doc.id,
                                        postTopic: p.topic,
                                        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                                        read: false,
                                        replied: false
                                    });
                                    totalNew++;
                                }
                            }
                        }
                    }
                    logSystem('success', `Monitoramento Finalizado`, `Novos Comentários: ${totalNew}`);
                } catch (err) {
                    console.error("Erro no Monitoramento:", err);
                    logSystem('error', `Falha Monitoramento`, err.message);
                }
            }
        }
    } else {
        console.log("⏸️ Scheduler de Engajamento está DESATIVADO.");
    }

    console.log("🏁 Verificação concluída.\n");
}

// ==========================================
// ROTAS DA API
// ==========================================

// Rota 1: Gerar Conteúdo (Autoral ou Manual)
app.post('/api/generate-content', async (req, res) => {
    try {
        const { format, manualTopic, manualImage, manualLink } = req.body;
        console.log(`🤖 Geração Manual. Format: ${format}. Topic: ${manualTopic || 'Auto'}`);

        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return res.status(400).json({ error: "Configurações não encontradas." });

        const settings = settingsDoc.data();
        settings.postFormat = format;

        const post = await generatePost(settings, logWrapper({ source: 'manual-trigger' }), manualTopic, manualImage, manualLink);

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
        const { type, context, content, link, image } = req.body;
        console.log(`💬 Gerando Reação (${type})...`);
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.data();
        const text = await generateReaction(type, context, content, link, settings, image);
        res.json({ success: true, text });
    } catch (error) {
        console.error("Erro Reaction:", error);
        res.status(500).json({ error: error.message });
    }
});

// NOVA ROTA: REFINAR TEXTO
app.post('/api/refine-text', async (req, res) => {
    try {
        const { currentContent, instructions } = req.body;
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.data();

        // Import refineText dynamically if not already imported or ensure strictly it's available
        // Note: It is imported at the top in server/index.js via destructuring require('./utils/gemini')
        // We just need to make sure index.js import line is updated. *Wait, I shouldn't rely on auto-update.* 
        // I will assume I need to update the import line in index.js as well.
        // Actually, let's update index.js completely.

        // For now, let's assume the function is imported.
        const { refineText } = require('./utils/gemini');

        const newText = await refineText(settings, currentContent, instructions);
        res.json({ success: true, newText });
    } catch (e) {
        console.error("Erro Refine:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- ROTAS DE ENGAJAMENTO (NOVO) ---
app.post('/api/sync-comments', async (req, res) => {
    try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.data();

        const limitPosts = settings.scheduler?.engagement?.monitorCount || 20;
        console.log(`📥 Sync Manual: Buscando comentários dos últimos ${limitPosts} posts...`);

        const postsSnap = await db.collection('posts')
            .where('status', '==', 'published')
            .orderBy('publishedAt', 'desc')
            .limit(limitPosts)
            .get();

        let totalNew = 0;
        for (const doc of postsSnap.docs) {
            const p = doc.data();
            if (!p.linkedinPostId) continue;

            const r = await fetchComments(p.linkedinPostId, settings);
            if (r.success && r.comments) {
                for (const c of r.comments) {
                    const cRef = db.collection('comments').doc(c.id);
                    const cDoc = await cRef.get();
                    if (!cDoc.exists) {
                        await cRef.set({
                            ...c,
                            postDbId: doc.id,
                            postTopic: p.topic,
                            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                            read: false,
                            replied: false
                        });
                        totalNew++;
                    }
                }
            }
        }
        res.json({ success: true, newComments: totalNew });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA RPA (PUPPETEER) ---
app.post('/api/rpa/sync-comments', async (req, res) => {
    try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        // const settings = settingsDoc.data(); // Se tiver config de credenciais no banco, usar aqui

        // Pega as credenciais do .env ou do request
        const email = process.env.LINKEDIN_EMAIL;
        const password = process.env.LINKEDIN_PASSWORD;

        const limitPosts = 5; // Limita a 5 posts por vez para não bloquear
        console.log(`🤖 RPA Manual: Buscando comentários dos últimos ${limitPosts} posts...`);

        const postsSnap = await db.collection('posts')
            .where('status', '==', 'published')
            .orderBy('publishedAt', 'desc')
            .limit(limitPosts)
            .get();

        const postsToScan = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Executa o Scraper
        // Se estiver rodando local, headless: false ajuda a ver. Em produção, true.
        // Vamos forçar false aqui pois o usuário pediu "loga acessa navega" e provavelmente quer ver/interagir se precisar.
        const result = await scrapeLinkedInComments(db, postsToScan, {
            email,
            password,
            headless: false
        });

        if (result.success) {
            res.json({ success: true, newComments: result.newComments });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/comments', async (req, res) => {
    try {
        const snapshot = await db.collection('comments')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ success: true, comments });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reply-comment', async (req, res) => {
    try {
        const { commentId, postUrn, text } = req.body; // commentId is the URN of the comment we are replying to
        const settingsDoc = await db.collection('settings').doc('global').get();

        const result = await replyToComment(postUrn, commentId, text, settingsDoc.data());

        if (result.success) {
            // Marca como respondido no banco local
            await db.collection('comments').doc(commentId).update({
                replied: true,
                replyId: result.id,
                read: true
            });
            res.json({ success: true, id: result.id });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mark-read/:id', async (req, res) => {
    try {
        await db.collection('comments').doc(req.params.id).update({ read: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
app.post('/api/reorder-posts', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) return res.status(400).json({ error: "Invalid data" });

        const batch = db.batch();
        orderedIds.forEach((id, index) => {
            if (!id) return;
            const ref = db.collection('posts').doc(id);
            batch.update(ref, { publicationOrder: index });
        });

        await batch.commit();
        res.json({ success: true });
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
            if (postDoc.data().originalPdfUrl) {
                await postComment(result.id, `📄 Leia o estudo completo aqui: ${postDoc.data().originalPdfUrl}`, settingsDoc.data());
            }
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
    // Agora aguardamos a execução para garantir logs
    console.log("📥 Recebido ping do UptimeRobot.");
    try {
        await runScheduler();
        res.json({ status: 'Scheduler Finished', timestamp: new Date().toISOString() });
    } catch (e) {
        console.error("🔥 Erro Crítico no Cron:", e);
        res.status(500).json({ error: e.message });
    }
});

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/.*/, (req, res) => {
    const indexPath = path.join(__dirname, '../client/dist/index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error("Error serving index.html:", err.message);
            res.status(404).send("Client build not found");
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
module.exports = app;
