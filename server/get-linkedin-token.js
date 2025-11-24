const axios = require('axios');

// COLE AQUI AS SUAS CREDENCIAIS
const CLIENT_ID = '77j64l02pa24s';
const CLIENT_SECRET = 'WPL_AP1.pttyEZCO9FuE7O8';  // Cole aqui o Client Secret completo
const AUTHORIZATION_CODE = 'AQTVAQclm4OuimYBWuddz9fYJsygJo9Jqmrf1Lp0Yzam6mWsNU3khM4qzJd0LYvYHLoaFNdP3Vhn2UhrnHuHe9_IUu0h9';
const REDIRECT_URI = 'https://localhost:5173/';

async function getAccessToken() {
    try {
        console.log('🔄 Trocando código por Access Token...\n');

        const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
            params: {
                grant_type: 'authorization_code',
                code: AUTHORIZATION_CODE,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('✅ Access Token obtido com sucesso!\n');
        console.log('📋 COPIE ESTAS INFORMAÇÕES PARA O SETTINGS:\n');
        console.log('Access Token:', response.data.access_token);
        console.log('\nExpira em:', response.data.expires_in, 'segundos');

        // Agora vamos pegar o URN
        await getUserProfile(response.data.access_token);

    } catch (error) {
        console.error('❌ Erro ao obter token:', error.response?.data || error.message);
    }
}

async function getUserProfile(accessToken) {
    try {
        console.log('\n🔄 Obtendo informações do perfil...\n');

        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log('✅ Perfil obtido!\n');
        console.log('📋 LinkedIn URN:', `urn:li:person:${response.data.sub}`);
        console.log('\nNome:', response.data.name);
        console.log('Email:', response.data.email);

        console.log('\n==============================================');
        console.log('✨ COPIE ESTES VALORES PARA O SETTINGS:');
        console.log('==============================================');
        console.log('LinkedIn Access Token:', accessToken);
        console.log('LinkedIn URN:', `urn:li:person:${response.data.sub}`);
        console.log('==============================================\n');

    } catch (error) {
        console.error('❌ Erro ao obter perfil:', error.response?.data || error.message);
    }
}

getAccessToken();
