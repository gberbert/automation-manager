import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração para ler diretórios em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, 'client', 'package.json');
const versionFilePath = path.join(__dirname, 'client', 'src', 'version.js');

console.log('🔍 Lendo versão atual...');

try {
    // 1. Ler o package.json do Client
    if (!fs.existsSync(packageJsonPath)) {
        throw new Error('Arquivo client/package.json não encontrado!');
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    // 2. Incrementar a versão (Lógica: Patch 0.0.X)
    let versionParts = currentVersion.split('.').map(Number);
    versionParts[2] += 1; // Incrementa o último número
    const newVersion = versionParts.join('.');

    // 3. Atualizar o package.json
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // 4. Criar/Atualizar o arquivo src/version.js para o React ler
    const versionFileContent = `export const appVersion = "${newVersion}";\n`;
    fs.writeFileSync(versionFilePath, versionFileContent);

    console.log(`✅ Versão atualizada: ${currentVersion} -> ${newVersion}`);

    // 5. Executar comandos GIT
    console.log('📦 Adicionando arquivos ao Git...');
    execSync('git add .', { stdio: 'inherit' });

    console.log(`🔖 Criando commit "release v${newVersion}"...`);
    execSync(`git commit -m "release v${newVersion}"`, { stdio: 'inherit' });

    console.log('🚀 Enviando para o GitHub (Push)...');
    execSync('git push', { stdio: 'inherit' });

    console.log('🎉 Release e Deploy realizados com sucesso!');

} catch (error) {
    console.error('❌ Erro no processo de release:', error.message);
    process.exit(1);
}