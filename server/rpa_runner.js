const { scrapeLinkedInComments } = require('./services/linkedinScraper');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// [DEBUG] Log de início bruto para verificar se o Scheduler está chamando o node corretamente
const DEBUG_LOG_PATH = path.join(__dirname, 'rpa_scheduler_debug.txt');
try {
    fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] Runner iniciado por: ${process.env.USERNAME || 'SYSTEM'}\n`);
} catch (e) { }

// Garante carregamento do .env com caminho absoluto
require('dotenv').config({ path: path.join(__dirname, '.env') });

// --- INICIALIZAÇÃO DO FIREBASE ---
if (!admin.apps.length) {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else {
            // Tenta achar na pasta atual (server)
            let serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

            // Se não achar, tenta na raiz (..)
            if (!fs.existsSync(serviceAccountPath)) {
                serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
            }

            if (fs.existsSync(serviceAccountPath)) {
                serviceAccount = require(serviceAccountPath);
            }
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("🔥 Firebase Admin conectado (Modo Runner Inteligent).");
        } else {
            console.error("❌ Falha: Credenciais do Firebase não encontradas.");
            process.exit(1);
        }
    } catch (e) {
        console.error("❌ Erro inicializando Firebase:", e.message);
        process.exit(1);
    }
}

const db = admin.firestore();

// --- EXECUÇÃO DO RPA ---
async function run() {
    console.log("🤖 Iniciando Check do RPA...");

    try {
        // 1. Ler Configurações do App (Firestore)
        const settingsRef = db.collection('settings').doc('global');
        const settingsDoc = await settingsRef.get();

        if (!settingsDoc.exists) {
            console.log("⚠️ Configurações não encontradas (doc 'global'). Abortando.");
            process.exit(0);
        }

        const settings = settingsDoc.data();
        const engagementConfig = settings.scheduler?.engagement;

        // VERIFICAÇÃO 1: Está ativado?
        if (!engagementConfig || !engagementConfig.enabled) {
            console.log("⏸️ Monitoramento de Engajamento está DESATIVADO no App.");
            process.exit(0);
        }

        // VERIFICAÇÃO 2: Cooldown (Intervalo Inteligente)
        // Definindo intervalo mínimo de 5 minutos (PARA TESTES)
        const MIN_INTERVAL_MINUTES = 5;
        let lastRun = new Date(0);
        if (settings.lastEngagementRun) {
            // Se for Timestamp do Firestore (tem toDate), usa. Se for String/Date, usa direto.
            lastRun = typeof settings.lastEngagementRun.toDate === 'function'
                ? settings.lastEngagementRun.toDate()
                : new Date(settings.lastEngagementRun);
        }
        const now = new Date();
        const diffMinutes = (now - lastRun) / 1000 / 60;

        console.log(`⏱️ Última execução: ${lastRun.toLocaleString()} (${Math.floor(diffMinutes)} min atrás).`);

        if (diffMinutes < MIN_INTERVAL_MINUTES && !process.argv.includes('--force')) {
            console.log(`⏳ Cooldown ativo. Aguardando completar ${MIN_INTERVAL_MINUTES} min.`);

            // Log opcional para debug visível no app, útil para validação
            // await db.collection('system_logs').add({
            //     type: 'info',
            //     message: `RPA Skip: Cooldown ativo (${Math.floor(diffMinutes)}/${MIN_INTERVAL_MINUTES} min).`,
            //     source: 'windows_scheduler_rpa',
            //     timestamp: admin.firestore.FieldValue.serverTimestamp()
            // });

            process.exit(0);
        }

        console.log("🚀 Intervalo atingido. Iniciando varredura...");

        // 2. Busca posts para escancear
        // Pega posts PUBLISHED (não approved)
        const limitPosts = engagementConfig.monitorCount || 10;

        console.log(`🔎 Buscando últimos ${limitPosts} posts publicados...`);

        const postsSnap = await db.collection('posts')
            .where('status', '==', 'published')
            .orderBy('publishedAt', 'desc')
            .limit(limitPosts)
            .get();

        let postsToScan = [];
        postsSnap.forEach(doc => {
            const data = doc.data();
            if (data.linkedinPostId) {
                postsToScan.push({ id: doc.id, ...data });
            }
        });

        if (postsToScan.length === 0) {
            console.log("⚠️ Nenhum post publicado encontrado para escanear.");
            await db.collection('system_logs').add({
                type: 'info',
                message: `RPA: Nenhum post publicado encontrado para escanear.`,
                source: 'windows_scheduler_rpa',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // EXECUTA O SCRAPER
            // Verifica flag --manual para rodar com interface gráfica (útil para login/debug, e para capturar rede)
            const isManualMode = process.argv.includes('--manual');

            const result = await scrapeLinkedInComments(db, postsToScan, {
                email: process.env.LINKEDIN_EMAIL,
                password: process.env.LINKEDIN_PASSWORD,
                headless: !isManualMode // Se for manual, headless = false
            });
            console.log("📊 Resultado do Ciclo:", result);

            // LOG NO SISTEMA (Para aparecer na aba Logs do App)
            try {
                const logType = result.success ? 'success' : 'error';
                const logMsg = result.success
                    ? `Automação (RPA): Ciclo concluído. Escaneados: ${postsToScan.length}. Novos: ${result.newComments || 0}.`
                    : `Automação (RPA): Falha parcial. Erro: ${result.error}`;

                await db.collection('system_logs').add({
                    type: logType,
                    message: logMsg,
                    details: JSON.stringify(result),
                    source: 'windows_scheduler_rpa',
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) { console.error("Erro ao salvar log:", e); }

            // ATUALIZA TIMESTAMP
            // Só atualiza se rodou com sucesso (ou tentou)
            if (result && (result.success || result.newComments >= 0)) {
                await settingsRef.update({
                    lastEngagementRun: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log("✅ Timestamp de execução atualizado.");
            }
        }

    } catch (error) {
        console.error("🔥 Erro fatal no Runner:", error);
        // Tenta logar o erro fatal
        try {
            await db.collection('system_logs').add({
                type: 'error',
                message: `Automação (RPA): Erro Fatal - ${error.message}`,
                source: 'windows_scheduler_rpa',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { }
    } finally {
        console.log("👋 Encerrando...");
        process.exit(0);
    }
}

run();
