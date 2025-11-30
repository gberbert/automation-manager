const admin = require('firebase-admin');

try {
    const serviceAccount = require('./serviceAccountKey.json');
    console.log('Service account loaded:', {
        project_id: serviceAccount.project_id,
        client_email: serviceAccount.client_email
    });

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();
    console.log('✅ Firestore initialized successfully');

    // Test connection
    db.collection('test').doc('test').set({ test: true })
        .then(() => console.log('✅ Test write successful'))
        .catch(err => console.error('❌ Test write failed:', err));

} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
}
