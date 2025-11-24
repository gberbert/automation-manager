
# --- CONFIGURAÇÃO ---
# 👇👇👇 COLE SEU TOKEN NOVO AQUI 👇👇👇
$Token = "Bearer AQWqJb7VzSl67Ab_ZlzI1tH4_MVyMchYbTOjHzepCvy8qYAC7eMNV72THhHBKtDPkijosamLJeoWfUw-gkimVfR0JTSP9tIxuwjSCV3G83jqyRGbhcqpidRzC61ZpLRRUTwtyfE4KSPHg4DscLw-9wMT2BoU1NFnNvcyRTmjYrBfQy8W3pqFHdGNkzkEE9YfnI3M_ErXpBWepIlkaTDEp_Y32J7DT33obFBowDHKw1flW2LL492Rk1OjnEQaN5HfsDNRkzV7oLO9qnGhXudfgt3GfcdXS8CLsfn0NFkEHmXF8x8P22v0rYPuUCUGHlVA2CsF-5G9CW6ahvu4Dm5H6Rw68FVztQ" 
# 👆👆👆 -------------------------- 👆👆👆

Clear-Host
Write-Host "1. Pegando ID do Token..." -ForegroundColor Cyan

try {
    $User = Invoke-RestMethod -Uri "https://api.linkedin.com/v2/userinfo" -Headers @{ "Authorization" = $Token }
    $ID_Real = $User.sub
    
    if (-not $ID_Real) { throw "ID não encontrado." }

    # AQUI ESTÁ A MUDANÇA: Usaremos o ID que o token mandou
    # Usamos o prefixo 'person' que é o padrão do OpenID
    $URN = "urn:li:person:$ID_Real" 
    
    Write-Host "✅ ID do Token: $ID_Real" -ForegroundColor Green
    Write-Host "👉 Tentaremos postar como: $URN" -ForegroundColor Yellow

} catch {
    Write-Host "❌ Erro ao pegar ID: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host "`n2. Enviando Post..." -ForegroundColor Cyan

$JsonBody = @"
{
    "author": "$URN",
    "lifecycleState": "PUBLISHED",
    "specificContent": {
        "com.linkedin.ugc.ShareContent": {
            "shareCommentary": {
                "text": "Teste ID Alfanumérico - $(Get-Date -Format 'HH:mm:ss')"
            },
            "shareMediaCategory": "NONE"
        }
    },
    "visibility": {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
    }
}
"@

try {
    $Response = Invoke-RestMethod -Uri "https://api.linkedin.com/v2/ugcPosts" `
        -Method Post `
        -Headers @{ 
            "Authorization" = $Token
            "X-Restli-Protocol-Version" = "2.0.0"
        } `
        -ContentType "application/json" `
        -Body $JsonBody

    Write-Host "`n✅ SUCESSO!! O problema era o ID numérico." -ForegroundColor Green
    Write-Host "ID do Post: $($Response.id)"

} catch {
    Write-Host "`n❌ FALHA:" -ForegroundColor Red
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host $reader.ReadToEnd() -ForegroundColor Yellow
    } else {
        Write-Host $_.Exception.Message
    }
}