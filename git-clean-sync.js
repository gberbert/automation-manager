const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Pega o argumento. Se tiver espaços, o Node já entrega como string única se usou aspas no terminal.
const targetCommit = process.argv[2] || 'HEAD';

console.log(`🚨 INICIANDO SINCRONIZAÇÃO PROFUNDA`);
console.log(`🎯 Alvo: "${targetCommit}"`);
console.log("⚠️  Atenção: Isso apagará arquivos não rastreados e reinstalará dependências!\n");

try {
    const run = (command) => {
        console.log(`> ${command}`);
        try {
            execSync(command, { stdio: 'inherit' });
        } catch (e) {
            // Se falhar, lançamos o erro para parar o script imediatamente
            throw new Error(`Falha ao executar: ${command}`);
        }
    };

    // 1. Força o Git a voltar
    console.log("\n🔄 1. Resetando arquivos rastreados...");
    run(`git reset --hard "${targetCommit}"`);

    // 2. Limpa arquivos "fantasmas" (PROTEGENDO O PRÓPRIO SCRIPT)
    console.log("\n🧹 2. Excluindo arquivos não rastreados...");
    // -e git-clean-sync.js impede que o script se apague
    run('git clean -fd -e git-clean-sync.js'); 

    // 3. Limpeza das dependências
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    const clientModules = path.join(__dirname, 'client', 'node_modules');
    const serverModules = path.join(__dirname, 'server', 'node_modules');

    const removeDir = (dir) => {
        if (fs.existsSync(dir)) {
            console.log(`🗑️  Removendo ${dir}...`);
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch (e) {
                console.warn(`⚠️  Não foi possível apagar ${dir} (pode estar em uso), tentando continuar...`);
            }
        }
    };

    console.log("\n🗑️  3. Limpando dependências antigas...");
    removeDir(nodeModulesPath);
    removeDir(clientModules);
    removeDir(serverModules);

    // 4. Reinstalação
    console.log("\n📦 4. Reinstalando dependências...");
    run('npm install'); // Raiz

    if (fs.existsSync(path.join(__dirname, 'client'))) {
        console.log("📦 Instalando Client...");
        run('cd client && npm install');
    }
    if (fs.existsSync(path.join(__dirname, 'server'))) {
        console.log("📦 Instalando Server...");
        run('cd server && npm install');
    }

    console.log("\n✅ SUCESSO! Ambiente limpo e sincronizado com " + targetCommit);

} catch (error) {
    console.error("\n❌ ERRO CRÍTICO:");
    console.error(error.message);
    process.exit(1);
}