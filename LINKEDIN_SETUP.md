# Guia: Como obter credenciais da API do LinkedIn

## Passo 1: Criar um App no LinkedIn Developers

1. Acesse: https://www.linkedin.com/developers/apps
2. Clique em **"Create app"**
3. Preencha as informações:
   - **App name**: Automation Manager
   - **LinkedIn Page**: Você precisa ter uma página do LinkedIn (pessoal ou empresa)
   - **Privacy policy URL**: Pode usar uma URL temporária como `https://example.com/privacy`
   - **App logo**: Faça upload de qualquer imagem (256x256px)
4. Marque a caixa de concordância e clique em **"Create app"**

## Passo 2: Configurar Produtos (Products)

1. Na página do seu app, vá para a aba **"Products"**
2. Solicite acesso aos seguintes produtos:
   - **Sign In with LinkedIn using OpenID Connect** (aprovação automática)
   - **Share on LinkedIn** (aprovação automática)
   - **Marketing Developer Platform** (REQUER APROVAÇÃO - pode levar dias/semanas)

⚠️ **IMPORTANTE**: Para publicar posts via API, você precisa do "Marketing Developer Platform", que requer aprovação manual do LinkedIn.

## Passo 3: Configurar OAuth 2.0

1. Vá para a aba **"Auth"**
2. Em **"Redirect URLs"**, adicione:
   - `http://localhost:3000/auth/linkedin/callback`
   - `http://localhost:5174/auth/callback`
3. Anote suas credenciais:
   - **Client ID**: (copie este valor)
   - **Client Secret**: (copie este valor)

## Passo 4: Obter Access Token (Método Manual - Para Testes)

### Opção A: Usando OAuth Playground (Mais Fácil)

1. Acesse: https://www.linkedin.com/developers/tools/oauth
2. Selecione seu app
3. Selecione os scopes:
   - `openid`
   - `profile`
   - `w_member_social` (para postar como pessoa)
   - `w_organization_social` (para postar como página/empresa)
4. Clique em "Request Access Token"
5. Copie o **Access Token** gerado

⚠️ **Nota**: Este token expira em 60 dias. Para produção, você precisará implementar OAuth refresh tokens.

### Opção B: Manualmente via URL (Avançado)

1. Monte a URL de autorização:
```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=SEU_CLIENT_ID&redirect_uri=http://localhost:3000/auth/linkedin/callback&scope=openid%20profile%20w_member_social
```

2. Acesse essa URL no navegador
3. Autorize o app
4. Você será redirecionado com um `code` na URL
5. Troque o code por um access token:

```bash
curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=SEU_CODE_AQUI" \
  -d "client_id=SEU_CLIENT_ID" \
  -d "client_secret=SEU_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/auth/linkedin/callback"
```

## Passo 5: Obter seu LinkedIn URN (ID)

### Para Pessoa (Person URN):

1. Com o access token, faça uma requisição:
```bash
curl -X GET https://api.linkedin.com/v2/userinfo \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

2. Na resposta, procure por `sub` - esse é seu Person URN
   - Exemplo: `sub: "abc123"` → URN será `urn:li:person:abc123`

### Para Organização (Company URN):

1. Liste suas organizações:
```bash
curl -X GET "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id)))" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

2. Pegue o ID da organização e monte o URN:
   - Exemplo: ID `12345` → URN será `urn:li:organization:12345`

## Resumo: O que você precisa configurar no app

No final, você terá:
- ✅ **LinkedIn Access Token**: Token de acesso OAuth
- ✅ **LinkedIn URN**: Seu ID de pessoa ou organização no formato `urn:li:person:XXX` ou `urn:li:organization:XXX`

## ⚠️ Limitações Importantes

1. **Aprovação necessária**: Para publicar posts via API, você precisa de aprovação do LinkedIn para "Marketing Developer Platform"
2. **Rate Limits**: LinkedIn tem limites de requisições (varia por produto)
3. **Token Expiration**: Access tokens expiram em 60 dias
4. **Uso Pessoal**: Para uso pessoal/testes, você pode usar sua conta. Para produção em escala, precisa de aprovação

## Alternativa Temporária (Para Testes)

Enquanto aguarda aprovação do LinkedIn, você pode:
1. Testar apenas a geração de conteúdo (Gemini)
2. Aprovar os posts no app
3. Copiar o conteúdo manualmente e postar no LinkedIn
4. Quando conseguir as credenciais, a publicação automática funcionará

---

**Próximos passos:**
1. Crie o app no LinkedIn
2. Me envie o Client ID e Client Secret
3. Vou criar uma rota de OAuth no servidor para facilitar a obtenção do token
