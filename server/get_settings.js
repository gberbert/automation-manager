
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function showSettings() {
    const doc = await db.collection('settings').doc('global').get();
    if (!doc.exists) {
        console.log("No settings found");
    } else {
        const s = doc.data();
        console.log("Scheduler Engagement Config:");
        console.log(JSON.stringify(s.scheduler?.engagement, null, 2));
        console.log("Last Run:", s.lastEngagementRun ? s.lastEngagementRun.toDate() : "Never");
    }
}
showSettings();
