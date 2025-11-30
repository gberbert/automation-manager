# Como Configurar o LinkedIn OAuth

Agora você pode configurar o LinkedIn diretamente pela interface do aplicativo!

## Passo a Passo:

### 1. Configure o Redirect URI no LinkedIn Developer Portal

1. Acesse [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
2. Clique na sua aplicação **automation-manager**
3. Vá até a aba **"Auth"**
4. Em **"OAuth 2.0 Redirect URLs"**, adicione:
   - **Desenvolvimento**: `http://localhost:3000/auth/linkedin/callback`
   - **Produção**: `https://SEU_DOMINIO/auth/linkedin/callback`
5. Clique em **"Update"**

### 2. Configure as Credenciais no App

1. Abra a aplicação e vá em **Settings**
2. Cole o **Client ID**: `77j64l02pa24s`
3. Cole o **Client Secret** completo
4. Verifique o **Redirect URI** (já pré-preenchido)
5. Clique em **"Save Changes"** para salvar as credenciais
6. Clique no botão **"Connect LinkedIn Account"**
7. Uma janela popup será aberta
8. **Autorize** o acesso no LinkedIn
9. A janela fechará automaticamente e as credenciais serão salvas!

## Resultado:

✅ O **Access Token** e **LinkedIn URN** serão automaticamente preenchidos
✅ Você poderá publicar posts diretamente no LinkedIn
✅ Funciona tanto em dev quanto em produção (basta ajustar o Redirect URI)

## Notas:

- Quando subir para produção, lembre-se de:
  1. Adicionar o novo Redirect URI no LinkedIn Developer Portal
  2. Atualizar o campo "Redirect URI" nas Settings
  3. Reconectar a conta LinkedIn clicando no botão novamente
