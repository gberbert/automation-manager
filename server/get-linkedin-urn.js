const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function getCorrectURN() {
    try {
        // Get access token from Firestore
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.data();

        if (!settings.linkedinAccessToken) {
            console.error('❌ No access token found. Please connect LinkedIn first.');
            process.exit(1);
        }

        console.log('🔍 Fetching your LinkedIn profile...\n');

        // Get profile using the correct endpoint
        const response = await axios.get('https://api.linkedin.com/v2/me', {
            headers: {
                'Authorization': `Bearer ${settings.linkedinAccessToken}`
            }
        });

        const id = response.data.id;
        const correctURN = `urn:li:person:${id}`;

        console.log('✅ Profile found!\n');
        console.log('='.repeat(50));
        console.log('YOUR CORRECT LinkedIn URN:');
        console.log('='.repeat(50));
        console.log(correctURN);
        console.log('='.repeat(50));
        console.log('\n📋 Copy this URN and paste it in Settings!\n');

        // Auto-update in Firestore
        await db.collection('settings').doc('global').update({
            linkedinUrn: correctURN
        });
        console.log('✅ URN automatically updated in database!\n');

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }

    process.exit(0);
}

getCorrectURN();
