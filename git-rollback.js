const { execSync } = require('child_process');

// Pega o argumento passado na linha de comando (o hash do commit)
const targetCommit = process.argv[2];

if (!targetCommit) {
    console.error("❌ Erro: Você precisa fornecer o Hash do Commit.");
    console.log("👉 Uso: node git-rollback.js <HASH_DO_COMMIT>");
    process.exit(1);
}

console.log(`🚨 INICIANDO ROLLBACK PARA O COMMIT: ${targetCommit}`);
console.log("⚠️  Atenção: Isso descartará todas as alterações locais não salvas!\n");

try {
    // Função auxiliar para rodar comandos
    const run = (command) => {
        console.log(`> ${command}`);
        execSync(command, { stdio: 'inherit' });
    };

    // 1. Garante que não há arquivos 'soltos' que impediriam o checkout/reset
    // (Opcional: removemos alterações não commitadas para garantir limpeza)
    console.log("🧹 Limpando estado atual...");
    run('git clean -fd'); 
    
    // 2. Reseta o HEAD para o commit desejado (Modo Hard)
    console.log(`zkcd Voltando no tempo para ${targetCommit}...`);
    run(`git reset --hard ${targetCommit}`);

    // 3. (Opcional) Se você precisar forçar esse estado no servidor remoto:
    // run(`git push origin HEAD --force`);
    // console.log("☁️  Repositório remoto atualizado (Force Push).");

    console.log("\n✅ Rollback concluído com sucesso!");
    console.log(`O projeto está agora exatamente como no commit ${targetCommit}.`);

} catch (error) {
    console.error("\n❌ FALHA NO ROLLBACK:");
    console.error(error.message);
    process.exit(1);
}