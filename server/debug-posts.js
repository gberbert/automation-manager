const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugPosts() {
    console.log("🔍 Iniciando Diagnóstico de Posts...\n");

    try {
        // 1. Busca genérica (sem filtros complexos) para ver se acha ALGO
        const snapshot = await db.collection('posts').where('status', '==', 'approved').get();
        
        console.log(`📊 Total de posts com status 'approved': ${snapshot.size}`);

        if (snapshot.empty) {
            console.log("❌ O servidor NÃO VÊ nenhum post aprovado.");
            console.log("   -> Verifique se o status no banco é exatamente 'approved' (minúsculo).");
            console.log("   -> Verifique se você está no projeto Firebase correto.");
        } else {
            console.log("\n📋 Detalhes dos posts encontrados:");
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                console.log(`\n🆔 ID: ${doc.id}`);
                console.log(`   - Tópico: ${data.topic || '(Sem tópico)'}`);
                console.log(`   - Platform: ${data.platform || '(Undefined - Padrão LinkedIn)'}`);
                console.log(`   - CreatedAt: ${data.createdAt ? '✅ Existe' : '❌ AUSENTE (Isso quebra o agendador!)'}`);
                
                if (data.createdAt) {
                    // Verifica se é um Timestamp real ou string
                    const isTimestamp = data.createdAt.toDate && typeof data.createdAt.toDate === 'function';
                    console.log(`   - CreatedAt Tipo: ${isTimestamp ? 'Timestamp (Correto)' : 'String/Outro (Errado)'}`);
                }
            });

            // 2. Teste da Query Exata do Agendador
            console.log("\n🧪 Testando a query exata do Agendador (com OrderBy)...");
            try {
                const queryExact = await db.collection('posts')
                    .where('status', '==', 'approved')
                    .orderBy('createdAt', 'asc')
                    .limit(1)
                    .get();
                
                if (!queryExact.empty) {
                    console.log("✅ Query do Agendador FUNCIONA! Ele vê o post.");
                } else {
                    console.log("⚠️ Query do Agendador retornou VAZIO.");
                    console.log("   -> MOTIVO PROVÁVEL: O campo 'createdAt' não está indexado ou o formato está errado.");
                }
            } catch (error) {
                console.error("❌ A Query do Agendador DEU ERRO:");
                console.error(error.message);
                if (error.message.includes('index')) {
                    console.log("   -> SOLUÇÃO: Você precisa recriar o índice composto no Firebase Console.");
                }
            }
        }

    } catch (error) {
        console.error("Erro fatal:", error);
    }
}

debugPosts();