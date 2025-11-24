const axios = require('axios');

/**
 * 1. Descobre quem é o dono do Token automaticamente
 * VERSÃO CORRIGIDA: Usa endpoint OpenID (userinfo)
 */
async function getCorrectAuthorId(accessToken) {
    try {
        console.log("🔍 Tentando endpoint moderno (userinfo)...");
        // Tenta endpoint moderno (OpenID)
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.data && response.data.sub) {
            return `urn:li:member:${response.data.sub}`;
        }
        throw new Error("Campo 'sub' não encontrado");
        
    } catch (error) {
        console.warn(`⚠️ Falha no userinfo: ${error.message}. Tentando fallback v2/me...`);
        
        // Fallback: Tenta endpoint antigo
        try {
            const legacyResponse = await axios.get('https://api.linkedin.com/v2/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            return `urn:li:member:${legacyResponse.data.id}`;
        } catch (legacyError) {
            // MENSAGEM NOVA PARA VOCÊ IDENTIFICAR NO LOG
            console.error("❌ Falha TOTAL ao descobrir ID:", legacyError.response?.data || legacyError.message);
            return null;
        }
    }
}

/**
 * 2. Registra o upload no LinkedIn
 */
async function registerUpload(authorUrn, accessToken) {
    const response = await axios.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": authorUrn,
                "serviceRelationships": [{
                    "relationshipType": "OWNER",
                    "identifier": "urn:li:userGeneratedContent"
                }]
            }
        },
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    return {
        uploadUrl: response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl,
        asset: response.data.value.asset
    };
}

/**
 * 3. Faz o upload binário
 */
async function uploadImageBinary(imageUrl, uploadUrl, accessToken) {
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await axios.put(uploadUrl, imageResponse.data, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' }
    });
}

/**
 * Função Principal de Publicação
 */
async function publishPost(post, settings) {
    if (!settings.linkedinAccessToken) {
        console.error("LinkedIn Access Token is missing");
        return false;
    }

    try {
        // PASSO MÁGICO: Ignora o URN manual e pega o real do token
        let authorUrn = await getCorrectAuthorId(settings.linkedinAccessToken);
        
        if (!authorUrn) {
            console.log("⚠️ Detecção automática falhou. Usando URN manual das Settings.");
            authorUrn = settings.linkedinUrn;
            if (authorUrn && authorUrn.startsWith('urn:li:person:')) {
                authorUrn = authorUrn.replace('urn:li:person:', 'urn:li:member:');
            }
        }

        if (!authorUrn) {
            throw new Error("Impossível determinar o Autor (URN). Conecte a conta novamente.");
        }

        console.log(`📤 Publicando como: ${authorUrn}`);

        let mediaAsset = null;
        let shareMediaCategory = "NONE";
        let mediaContent = [];

        // Upload de Imagem
        if (post.imageUrl) {
            try {
                const uploadPromise = (async () => {
                    const { uploadUrl, asset } = await registerUpload(authorUrn, settings.linkedinAccessToken);
                    await uploadImageBinary(post.imageUrl, uploadUrl, settings.linkedinAccessToken);
                    return asset;
                })();

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Timeout de upload")), 7000)
                );

                const asset = await Promise.race([uploadPromise, timeoutPromise]);
                
                mediaAsset = asset;
                shareMediaCategory = "IMAGE";
                mediaContent = [{
                    "status": "READY",
                    "description": { "text": post.imagePrompt || post.topic },
                    "media": asset,
                    "title": { "text": post.topic }
                }];

            } catch (error) {
                console.warn(`⚠️ Erro imagem (${error.message}). Postando como Link.`);
                shareMediaCategory = "ARTICLE";
                mediaContent = [{
                    "status": "READY",
                    "originalUrl": post.imageUrl,
                    "title": { "text": post.topic },
                }];
            }
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

        console.log("✅ Sucesso! ID:", response.data.id);
        return true;

    } catch (error) {
        console.error("❌ Erro fatal no LinkedIn:", JSON.stringify(error.response?.data || error.message));
        return false;
    }
}

module.exports = { publishPost };