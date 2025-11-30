const fs = require('fs');
const path = require('path');

// Configurações
const outputFileName = 'CONTEXTO_COMPLETO_PROJETO.txt';
const ignoreDirs = ['node_modules', '.git', 'build', 'dist', '.next', 'coverage'];
const ignoreFiles = ['package-lock.json', 'yarn.lock', '.DS_Store', '.env', 'gerar-contexto.js'];
const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.json', '.html', '.md'];

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    
    if (fs.statSync(fullPath).isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (!ignoreFiles.includes(file) && allowedExtensions.includes(path.extname(file))) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

const allFiles = getAllFiles(__dirname);
let fileContent = "ESTRUTURA DE ARQUIVOS E CÓDIGO FONTE DO PROJETO:\n\n";

// Adiciona árvore de diretórios simplificada no topo
fileContent += "--- LISTA DE ARQUIVOS ---\n";
allFiles.forEach(f => fileContent += f.replace(__dirname, '') + "\n");
fileContent += "\n\n";

// Adiciona o conteúdo de cada arquivo
allFiles.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = file.replace(__dirname, '');
        
        fileContent += `\n\n==================================================================\n`;
        fileContent += `ARQUIVO: ${relativePath}\n`;
        fileContent += `==================================================================\n\n`;
        fileContent += content;
    } catch (err) {
        console.error(`Erro ao ler arquivo ${file}: ${err.message}`);
    }
});

fs.writeFileSync(outputFileName, fileContent);
console.log(`\nSucesso! Arquivo '${outputFileName}' criado.`);
console.log(`Agora faça o upload desse arquivo no chat do Gemini.`);