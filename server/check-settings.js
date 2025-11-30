const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkSettings() {
    try {
        const doc = await db.collection('settings').doc('global').get();
        if (doc.exists) {
            console.log("Settings found:", doc.data());
        } else {
            console.log("Settings document 'global' does NOT exist.");
        }
    } catch (error) {
        console.error("Error checking settings:", error);
    }
}

checkSettings();
