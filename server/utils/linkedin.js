const axios = require('axios');

// --- HELPER: DETECTAR ID DO USUÁRIO ---
async function getAutoDetectedId(accessToken) {
    try {
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            timeout: 10000
        });
        if (response.data && response.data.sub) return `urn:li:person:${response.data.sub}`;
    } catch (error) { 
        console.warn("Falha auto-id LinkedIn:", error.message); 
    }
    return null;
}

// --- PASSO 1: REGISTRAR UPLOAD DE IMAGEM ---
async function registerImageUpload(authorUrn, accessToken) {
    const recipe = "urn:li:digitalmediaRecipe:feedshare-image";
    console.log(`📝 LinkedIn: Registrando Imagem...`);

    const response = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
        "registerUploadRequest": {
            "recipes": [recipe],
            "owner": authorUrn,
            "serviceRelationships": [{ "relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent" }]
        }
    }, { 
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000 
    });

    return { 
        uploadUrl: response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl, 
        asset: response.data.value.asset 
    };
}

// --- PASSO 2: UPLOAD DO BINÁRIO DA IMAGEM ---
async function uploadImageBinary(buffer, uploadUrl, accessToken) {
    console.log(`⬆️ Subindo bytes da imagem...`);
    await axios.put(uploadUrl, buffer, { 
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' }, 
        timeout: 60000 
    });
    console.log("✅ Imagem enviada.");
}

// --- ORQUESTRADOR DE UPLOAD (IMAGEM APENAS) ---
async function uploadImageOnly(fileUrl, settings) {
    if (!settings.linkedinAccessToken) throw new Error("Token ausente");
    let authorUrn = settings.linkedinUrn || await getAutoDetectedId(settings.linkedinAccessToken);
    if (!authorUrn) throw new Error("URN não encontrado");

    console.log(`🔄 Preparando Imagem para LinkedIn: ${fileUrl}`);

    // 1. Baixar Imagem (Cloudinary)
    const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = fileResponse.data;

    // 2. Registrar
    const { uploadUrl, asset } = await registerImageUpload(authorUrn, settings.linkedinAccessToken);

    // 3. Subir
    await uploadImageBinary(buffer, uploadUrl, settings.linkedinAccessToken);
    
    return asset; 
}

// --- PASSO 3: PUBLICAR ---
async function publishPost(post, settings, preUploadedAsset = null) {
    if (!settings.linkedinAccessToken) return { success: false, error: "Token ausente" };

    try {
        let authorUrn = settings.linkedinUrn || await getAutoDetectedId(settings.linkedinAccessToken);
        console.log(`📤 Publicando Post (Modo Imagem + Texto com Link)...`);

        let mediaContent = [];
        let shareMediaCategory = "NONE";

        if (preUploadedAsset) {
            shareMediaCategory = "IMAGE";
            mediaContent = [{
                "status": "READY",
                "description": { "text": post.topic },
                "media": preUploadedAsset,
                "title": { "text": post.topic }
            }];
        }

        const body = {
            "author": authorUrn,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": { "text": post.content }, // O Link do PDF está aqui dentro agora!
                    "shareMediaCategory": shareMediaCategory,
                    "media": mediaContent
                }
            },
            "visibility": { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
        };

        const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', body, {
            headers: {
                'Authorization': `Bearer ${settings.linkedinAccessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        console.log("✅ SUCESSO! ID:", response.data.id);
        return { success: true, id: response.data.id };

    } catch (error) {
        console.error("❌ Erro LinkedIn:", error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || error.message };
    }
}

module.exports = { publishPost, uploadImageOnly };