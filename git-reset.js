const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// CONFIGURAÇÃO: Sua URL do GitHub
const REMOTE_URL = "https://github.com/gberbert/automation-manager.git";
const BRANCH_NAME = "master"; // Ou 'main' se preferir

console.log("🚨 INICIANDO LIMPEZA PROFUNDA DO GIT...");
console.log("⚠️  Isso apagará o histórico de commits para remover segredos expostos.\n");

try {
    // 1. Apagar a pasta .git (O cérebro do Git)
    const gitFolder = path.join(__dirname, '.git');
    if (fs.existsSync(gitFolder)) {
        console.log("🗑️  Apagando pasta .git antiga...");
        fs.rmSync(gitFolder, { recursive: true, force: true });
    } else {
        console.log("ℹ️  Nenhuma pasta .git encontrada (limpo).");
    }

    // Função auxiliar para rodar comandos e mostrar output
    const run = (command) => {
        console.log(`\n> ${command}`);
        execSync(command, { stdio: 'inherit' });
    };

    // 2. Sequência de comandos de Reset
    run('git init');
    
    console.log("📦 Adicionando arquivos (respeitando .gitignore)...");
    run('git add .');
    
    console.log("xkcd Criando novo commit limpo...");
    run('git commit -m "Reset total: Limpeza de historico e segredos"');
    
    console.log(`🌿 Definindo branch principal para '${BRANCH_NAME}'...`);
    run(`git branch -M ${BRANCH_NAME}`);
    
    console.log("🔗 Conectando ao repositório remoto...");
    run(`git remote add origin ${REMOTE_URL}`);
    
    console.log("🚀 Forçando envio (Push Force)...");
    run(`git push -u origin ${BRANCH_NAME} --force`);

    console.log("\n✅ SUCESSO! Repositório limpo e sincronizado.");
    console.log("Agora o GitHub reflete exatamente o que está nesta pasta, sem histórico antigo.");

} catch (error) {
    console.error("\n❌ ERRO FATAL:");
    console.error(error.message);
    console.log("\nDica: Verifique se você tem permissão de escrita no repositório ou se o Git está instalado.");
}