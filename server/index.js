const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const admin = require('firebase-admin');
const { generatePost } = require('./utils/gemini');
const { publishPost } = require('./utils/linkedin');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
// Support both local file and Environment Variable (for Vercel)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var", e);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.warn("serviceAccountKey.json not found");
    }
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized");
} else {
    console.error("❌ Firebase credentials missing! Server will not function correctly.");
}

const db = admin.firestore();

// Logic to publish approved posts (extracted for reuse)
async function checkAndPublishPosts() {
    console.log('⏰ Checking for posts to publish...');
    try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) return { published: 0, message: "No settings found" };

        const settings = settingsDoc.data();
        const now = new Date();
        const approvedPostsSnapshot = await db.collection('posts')
            .where('status', '==', 'approved')
            .get();
        let publishedCount = 0;

        if (!approvedPostsSnapshot.empty) {
            for (const doc of approvedPostsSnapshot.docs) {
                const post = doc.data();
                // Check if scheduled time has passed OR if it's null (immediate)
                if (!post.scheduledFor || post.scheduledFor.toDate() <= now) {
                    console.log(`📤 Publishing post ${doc.id}...`);
                    
                    const success = await publishPost(post, settings);
                    
                    if (success) {
                        await db.collection('posts').doc(doc.id).update({
                            status: 'published',
                            publishedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`✅ Post ${doc.id} published!`);
                        publishedCount++;
                    } else {
                        // FIX: Mark as failed to prevent infinite retry loop which causes 429 Errors
                        console.error(`❌ Failed to publish post ${doc.id}. Marking as 'failed' to stop retries.`);
                        await db.collection('posts').doc(doc.id).update({
                            status: 'failed',
                            errorLog: 'Failed to publish automatically. Check server logs.',
                            lastAttempt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }
        }
        return { published: publishedCount, message: `Published ${publishedCount} posts` };
    } catch (error) {
        console.error("Scheduler error:", error);
        throw error;
    }
}

// Local Cron (only runs if process stays alive, e.g. local dev)
cron.schedule('* * * * *', async () => {
    await checkAndPublishPosts();
});

// Vercel Cron Endpoint
app.get('/api/cron', async (req, res) => {
    // Secure this endpoint! In production, check for a secret header
    // if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).send('Unauthorized');

    try {
        const result = await checkAndPublishPosts();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running!' });
});

// Generate content endpoint (doesn't save to DB, just returns content)
app.post('/api/generate-content', async (req, res) => {
    console.log('📝 Generate content request received');

    try {
        const settingsDoc = await db.collection('settings').doc('global').get();

        if (!settingsDoc.exists) {
            console.error('❌ No settings found');
            return res.status(400).json({ error: "Configure settings first in the Settings tab" });
        }

        const settings = settingsDoc.data();
        console.log('⚙️ Generating content...');

        const result = await generatePost(settings);

        if (result) {
            console.log('✅ Content generated successfully');
            res.json({ success: true, post: result });
        } else {
            console.error('❌ Failed to generate content');
            res.status(500).json({ error: "Failed to generate content. Check Gemini API key and topics." });
        }
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Publish post now endpoint
app.post('/api/publish-now/:postId', async (req, res) => {
    console.log('📤 Publish now request received for post:', req.params.postId);

    try {
        const { postId } = req.params;

        // Get settings
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists) {
            return res.status(400).json({ error: "Configure LinkedIn settings first" });
        }
        const settings = settingsDoc.data();

        // Get post
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) {
            return res.status(404).json({ error: "Post not found" });
        }
        const post = postDoc.data();

        console.log('📝 Publishing post to LinkedIn...');
        const success = await publishPost(post, settings);

        if (success) {
            await db.collection('posts').doc(postId).update({
                status: 'published',
                publishedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Post published successfully to LinkedIn!');
            res.json({ success: true, message: "Post published to LinkedIn!" });
        } else {
            console.error('❌ Failed to publish to LinkedIn');
            // Also mark as failed here to be consistent
            await db.collection('posts').doc(postId).update({
                status: 'failed',
                errorLog: 'Manual publish failed.',
                lastAttempt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.status(500).json({ error: "Failed to publish to LinkedIn. Check your LinkedIn credentials in Settings." });
        }
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// LinkedIn OAuth callback endpoint
app.get('/auth/linkedin/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code not found');
    }

    try {
        // Get settings to retrieve client credentials
        const settingsDoc = await db.collection('settings').doc('global').get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};

        const CLIENT_ID = settings.linkedinClientId || process.env.LINKEDIN_CLIENT_ID;
        const CLIENT_SECRET = settings.linkedinClientSecret || process.env.LINKEDIN_CLIENT_SECRET;
        const REDIRECT_URI = settings.linkedinRedirectUri || 'http://localhost:3000/auth/linkedin/callback';

        if (!CLIENT_ID || !CLIENT_SECRET) {
            return res.status(400).send('LinkedIn credentials not configured');
        }

        // Exchange code for access token
        const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
                grant_type: 'authorization_code',
                code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = tokenResponse.data.access_token;

        // Decode the JWT token to get user info (sub contains the member ID)
        // LinkedIn access tokens are JWTs that contain user info
        let memberId = null;
        try {
            // JWT tokens have 3 parts separated by dots
            const tokenParts = accessToken.split('.');
            if (tokenParts.length === 3) {
                // Decode the payload (middle part)
                const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                memberId = payload.sub; // This is the member ID
                console.log('✅ Extracted member ID from token:', memberId);
            }
        } catch (decodeError) {
            console.log('⚠️ Could not decode token, will try API call');
        }

        // If we couldn't get it from token, try the introspection endpoint
        if (!memberId) {
            try {
                const introspectResponse = await axios.post(
                    'https://www.linkedin.com/oauth/v2/introspectToken',
                    `token=${accessToken}`,
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `Bearer ${accessToken}`
                        }
                    }
                );
                memberId = introspectResponse.data.sub;
                console.log('✅ Got member ID from introspection:', memberId);
            } catch (introspectError) {
                console.log('⚠️ Could not introspect token');
            }
        }

        const urn = memberId ? `urn:li:person:${memberId}` : '';

        // Save access token and URN to Firestore
        await db.collection('settings').doc('global').set({
            linkedinAccessToken: accessToken,
            ...(urn && { linkedinUrn: urn })
        }, { merge: true });

        // Redirect back to settings page with success message
        res.send(`
            <html>
                <head>
                    <title>LinkedIn Connected</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            margin: 0;
                        }
                        .container {
                            background: white;
                            padding: 2rem;
                            border-radius: 1rem;
                            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                            text-align: center;
                        }
                        h1 { color: #0077b5; margin-bottom: 1rem; }
                        p { color: #666; margin-bottom: 1.5rem; }
                        button {
                            background: #0077b5;
                            color: white;
                            border: none;
                            padding: 0.75rem 2rem;
                            border-radius: 0.5rem;
                            font-size: 1rem;
                            cursor: pointer;
                        }
                        button:hover { background: #005582; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>✅ LinkedIn Connected!</h1>
                        <p>Your LinkedIn account access token has been saved.</p>
                        <p><strong>Next step:</strong> Fill in your LinkedIn URN in Settings.</p>
                        <p style="font-size: 0.9em; color: #888;">URN format: urn:li:person:YOUR_ID</p>
                        <button onclick="window.close()">Close Window</button>
                    </div>
                    <script>
                        setTimeout(() => window.close(), 3000);
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('LinkedIn OAuth error:', error.response?.data || error.message);
        res.status(500).send(`
            <html>
                <head>
                    <title>LinkedIn Connection Failed</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                            margin: 0;
                        }
                        .container {
                            background: white;
                            padding: 2rem;
                            border-radius: 1rem;
                            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                            text-align: center;
                        }
                        h1 { color: #f5576c; margin-bottom: 1rem; }
                        p { color: #666; margin-bottom: 1.5rem; }
                        button {
                            background: #f5576c;
                            color: white;
                            border: none;
                            padding: 0.75rem 2rem;
                            border-radius: 0.5rem;
                            font-size: 1rem;
                            cursor: pointer;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>❌ Connection Failed</h1>
                        <p>Failed to connect LinkedIn account.</p>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.close()">Close Window</button>
                    </div>
                </body>
            </html>
        `);
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Scheduler active`);
    });
}

module.exports = app;