const axios = require('axios');

/**
 * Helper: Descobre ID automático
 * AJUSTE: Retorna 'urn:li:person' (padrão que funcionou no PowerShell)
 */
async function getAutoDetectedId(accessToken) {
    try {
        console.log("🔍 Tentando detectar ID automaticamente (OpenID)...");
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.data && response.data.sub) {
            // O PowerShell provou que para este ID novo, o prefixo certo é 'person'
            return `urn:li:person:${response.data.sub}`;
        }
    } catch (error) {
        console.warn("⚠️ Falha na detecção automática:", error.message);
    }
    return null;
}

/**
 * Helper: Registra o upload de imagem
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
 * Helper: Faz o upload do binário da imagem
 */
async function uploadImageBinary(imageUrl, uploadUrl, accessToken) {
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await axios.put(uploadUrl, imageResponse.data, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' }
    });
}

/**
 * FUNÇÃO PRINCIPAL: Publicar Post
 */
async function publishPost(post, settings) {
    if (!settings.linkedinAccessToken) {
        console.error("❌ Erro: Token de acesso do LinkedIn não encontrado.");
        return false;
    }

    try {
        // 1. DEFINIÇÃO DO AUTOR
        let authorUrn = settings.linkedinUrn;

        // Se o manual estiver vazio, usa o automático (O PREFERIDO AGORA)
        if (!authorUrn) {
            authorUrn = await getAutoDetectedId(settings.linkedinAccessToken);
        }

        if (!authorUrn) {
            throw new Error("URN do Autor não configurado. Conecte a conta novamente.");
        }

        // REMOVIDA A CONVERSÃO FORÇADA DE 'PERSON' PARA 'MEMBER'
        // O ID novo (PQ...) precisa ser 'person'. O ID antigo (192...) precisa ser 'member'.
        // O usuário deve colocar o prefixo correto no manual, ou deixar o automático decidir.
        
        console.log(`📤 Publicando como: ${authorUrn}`);

        // 2. PREPARAÇÃO DA MÍDIA (Com Timeout de Segurança)
        let mediaAsset = null;
        let shareMediaCategory = "NONE";
        let mediaContent = [];

        if (post.imageUrl) {
            console.log('🖼️ Processando imagem...');
            try {
                const uploadPromise = (async () => {
                    const { uploadUrl, asset } = await registerUpload(authorUrn, settings.linkedinAccessToken);
                    await uploadImageBinary(post.imageUrl, uploadUrl, settings.linkedinAccessToken);
                    return asset;
                })();

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Timeout no upload da imagem")), 7000)
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
                console.log('✅ Imagem anexada com sucesso.');

            } catch (error) {
                console.warn(`⚠️ Imagem ignorada (${error.message}). Publicando como link/artigo.`);
                shareMediaCategory = "ARTICLE";
                mediaContent = [{
                    "status": "READY",
                    "originalUrl": post.imageUrl,
                    "title": { "text": post.topic }
                }];
            }
        }

        // 3. ENVIO DO POST
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

        console.log("✅ SUCESSO! Post ID:", response.data.id);
        return true;

    } catch (error) {
        const apiError = error.response?.data;
        console.error("❌ Erro fatal no LinkedIn:", JSON.stringify(apiError || error.message));
        return false;
    }
}

module.exports = { publishPost };