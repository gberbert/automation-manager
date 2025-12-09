
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
    console.log(`Connected to Project: ${admin.app().options.credential.projectId}`);
    console.log("Reading all comments (limit 10, no order)...");
    const snap = await db.collection('comments').limit(10).get();

    if (snap.empty) {
        console.log("No comments found.");
        return;
    }

    snap.forEach(doc => {
        const d = doc.data();
        console.log(`ID: ${doc.id}`);
        console.log(` - Text: ${d.text ? d.text.substring(0, 30) : 'N/A'}...`);
        console.log(` - CreatedAt: ${d.createdAt} (Type: ${typeof d.createdAt})`);
        console.log(` - Read: ${d.read} (Type: ${typeof d.read})`);
        console.log(` - Replied: ${d.replied}`);
        console.log(` - Source: ${d.source}`);
        console.log("---");
    });
}

check().catch(console.error);
