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

// --- PASSO 4: COMENTAR NO POST (LINK DO PDF) ---
async function postComment(shareUrn, text, settings) {
    if (!settings.linkedinAccessToken) return;

    try {
        let actorUrn = settings.linkedinUrn || await getAutoDetectedId(settings.linkedinAccessToken);
        console.log(`💬 Postando comentário no post ${shareUrn}...`);

        const body = {
            "actor": actorUrn,
            "object": shareUrn,
            "message": {
                "text": text
            }
        };

        // O URN do post precisa ser codificado se for passado na URL, mas aqui é socialActions/{urn}/comments
        // Testes indicam que não precisa de encodeURIComponent completo se for URN padrão, mas vamos garantir
        // Na verdade, a doc diz /socialActions/{shareUrn}/comments

        await axios.post(`https://api.linkedin.com/v2/socialActions/${shareUrn}/comments`, body, {
            headers: {
                'Authorization': `Bearer ${settings.linkedinAccessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log("✅ Comentário publicado com sucesso.");
    } catch (error) {
        console.error("⚠️ Falha ao comentar no post:", error.response?.data?.message || error.message);
        // Não lançamos erro para não falhar o fluxo principal de publicação
    }
}

// --- PASSO 5: BUSCAR COMENTÁRIOS ---
async function fetchComments(shareUrn, settings) {
    if (!settings.linkedinAccessToken) return { success: false, error: "Token ausente" };

    try {
        console.log(`🔎 Buscando comentários para ${shareUrn}...`);
        // Endpoint: /socialActions/{urn}/comments
        // Nota: URNs devem ser encoded se passados como parametro de URL, mas aqui é parte do path.
        // O LinkedIn recomenda passar URN direto no path.

        const response = await axios.get(`https://api.linkedin.com/v2/socialActions/${shareUrn}/comments?count=50`, {
            headers: { 'Authorization': `Bearer ${settings.linkedinAccessToken}` },
            timeout: 10000
        });

        const updatedComments = response.data.elements.map(c => ({
            id: c.$URN, // URN do comentário
            authorUrn: c.actor, // Quem comentou
            text: c.message.text,
            createdAt: c.created.time,
            objectUrn: c.object, // O post
            comments: c.commentsSummary?.totalFirstLevelComments || 0
        }));

        return { success: true, comments: updatedComments };

    } catch (error) {
        // Se der 404, pode ser que o post não exista mais ou não tenha social actions habilitadas
        console.warn(`⚠️ Erro ao buscar comentários (${shareUrn}):`, error.response?.status);
        return { success: false, error: error.message };
    }
}

// --- PASSO 6: RESPONDER A UM COMENTÁRIO (REPLY) ---
async function replyToComment(postUrn, parentCommentUrn, text, settings) {
    if (!settings.linkedinAccessToken) return { success: false, error: "Token ausente" };

    try {
        let actorUrn = settings.linkedinUrn || await getAutoDetectedId(settings.linkedinAccessToken);
        console.log(`💬 Respondendo comentário ${parentCommentUrn} no post ${postUrn}...`);

        const body = {
            "actor": actorUrn,
            "object": postUrn, // O objeto pai continua sendo o POST
            "parentComment": parentCommentUrn, // AQUI definimos que é uma resposta
            "message": { "text": text }
        };

        const response = await axios.post(`https://api.linkedin.com/v2/socialActions/${postUrn}/comments`, body, {
            headers: {
                'Authorization': `Bearer ${settings.linkedinAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ Resposta publicada. ID:", response.data.id);
        return { success: true, id: response.data.id };

    } catch (error) {
        console.error("❌ Erro ao responder comentário:", error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}


// --- PASSO 0: TROCAR CODE POR TOKEN (OAUTH) ---
async function exchangeToken(code, redirectUri, clientId, clientSecret) {
    console.log("🔄 Trocando Code por Token...");
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    try {
        const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log("✅ Token recebido com sucesso.");
        return {
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in
        };
    } catch (error) {
        console.error("❌ Erro ao trocar token:", error.response?.data || error.message);
        throw new Error(error.response?.data?.error_description || "Falha na troca do token");
    }
}

module.exports = { publishPost, uploadImageOnly, postComment, fetchComments, replyToComment, exchangeToken };