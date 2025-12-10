const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Inicializa Firebase
if (!admin.apps.length) {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        const p = path.join(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(p)) serviceAccount = require(p);
    }
    if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function check() {
    const doc = await db.collection('settings').doc('global').get();
    if (!doc.exists) return console.log("Config não encontrada");

    const data = doc.data();
    const lastRun = data.lastEngagementRun ? data.lastEngagementRun.toDate() : null;

    console.log("--- STATUS ATUAL ---");
    if (lastRun) {
        console.log(`Última Execução (DB): ${lastRun.toLocaleString()}`);
        const now = new Date();
        const diff = (now - lastRun) / 1000 / 60;
        console.log(`Tempo decorrido: ${Math.floor(diff)} minutos e ${Math.floor((diff % 1) * 60)} segundos`);

        if (diff < 5) {
            console.log(`⚠️ COOLDOWN ATIVO. Falta ${Math.ceil(5 - diff)} minutos.`);
            const nextSlot = new Date(lastRun.getTime() + 5 * 60000);
            console.log(`✅ Próxima execução permitida a partir de: ${nextSlot.toLocaleTimeString()}`);
        } else {
            console.log("✅ PRONTO PARA RODAR IMEDIATAMENTE.");
        }
    } else {
        console.log("Nunca rodou.");
    }
    process.exit();
}

check();
