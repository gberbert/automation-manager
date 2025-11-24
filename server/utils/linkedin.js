const axios = require('axios');

async function getAutoDetectedId(accessToken) {
    try {
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.data && response.data.sub) return `urn:li:person:${response.data.sub}`;
    } catch (error) {
        console.warn("⚠️ Falha na detecção automática:", error.message);
    }
    return null;
}

async function registerUpload(authorUrn, accessToken) {
    const response = await axios.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": authorUrn,
                "serviceRelationships": [{ "relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent" }]
            }
        },
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    return {
        uploadUrl: response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl,
        asset: response.data.value.asset
    };
}

async function uploadImageBinary(imageUrl, uploadUrl, accessToken) {
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await axios.put(uploadUrl, imageResponse.data, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' }
    });
}

// --- NOVA FUNÇÃO EXPORTADA PARA UPLOAD ISOLADO ---
async function uploadImageOnly(imageUrl, settings) {
    if (!settings.linkedinAccessToken) throw new Error("Token ausente");
    
    let authorUrn = settings.linkedinUrn || await getAutoDetectedId(settings.linkedinAccessToken);
    if (authorUrn && authorUrn.startsWith('urn:li:person:')) {
        authorUrn = authorUrn.replace('urn:li:person:', 'urn:li:member:');
    }
    if (!authorUrn) throw new Error("Author URN não encontrado");

    console.log(`🖼️ Iniciando upload isolado para: ${authorUrn}`);
    const { uploadUrl, asset } = await registerUpload(authorUrn, settings.linkedinAccessToken);
    await uploadImageBinary(imageUrl, uploadUrl, settings.linkedinAccessToken);
    console.log(`✅ Upload isolado concluído: ${asset}`);
    return asset;
}

// --- FUNÇÃO DE PUBLICAÇÃO ATUALIZADA ---
async function publishPost(post, settings, preUploadedAsset = null) {
    if (!settings.linkedinAccessToken) return false;

    try {
        let authorUrn = settings.linkedinUrn || await getAutoDetectedId(settings.linkedinAccessToken);
        if (authorUrn && authorUrn.startsWith('urn:li:person:')) {
            authorUrn = authorUrn.replace('urn:li:person:', 'urn:li:member:');
        }
        
        console.log(`📤 Publicando como: ${authorUrn}`);

        let shareMediaCategory = "NONE";
        let mediaContent = [];

        // Cenário 1: Imagem já foi subida no passo anterior (Ideal)
        if (preUploadedAsset) {
            console.log("📎 Usando imagem pré-carregada:", preUploadedAsset);
            shareMediaCategory = "IMAGE";
            mediaContent = [{
                "status": "READY",
                "description": { "text": post.topic },
                "media": preUploadedAsset,
                "title": { "text": post.topic }
            }];
        } 
        // Cenário 2: Fallback (Link) se não houver imagem nativa
        else if (post.imageUrl) {
            console.log("🔗 Usando modo Link (Fallback)");
            shareMediaCategory = "ARTICLE";
            mediaContent = [{
                "status": "READY",
                "originalUrl": post.imageUrl,
                "title": { "text": post.topic }
            }];
        }

        const body = {
            "author": authorUrn,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": { "text": post.content },
                    "shareMediaCategory": shareMediaCategory,
                    ...(mediaContent.length > 0 && { "media": mediaContent })
                }
            },
            "visibility": { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
        };

        const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', body, {
            headers: {
                'Authorization': `Bearer ${settings.linkedinAccessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ Post Publicado! ID:", response.data.id);
        return true;

    } catch (error) {
        console.error("❌ Erro no LinkedIn:", JSON.stringify(error.response?.data || error.message));
        return false;
    }
}

module.exports = { publishPost, uploadImageOnly };