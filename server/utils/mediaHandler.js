const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');
const { generateGeminiImage, generatePollinationsImage } = require('./imageGenerators');
const { findValidPdf } = require('./pdfProviders');

// --- CONFIGURAÇÃO ---
function configureCloudinary(settings) {
    if (!settings.cloudinaryCloudName) throw new Error("Faltam chaves Cloudinary.");
    cloudinary.config({
        cloud_name: settings.cloudinaryCloudName,
        api_key: settings.cloudinaryApiKey,
        api_secret: settings.cloudinaryApiSecret
    });
}

// --- UPLOADERS ---
async function uploadToSupabase(buffer, filename, settings) {
    if (!settings.supabaseUrl || !settings.supabaseKey) throw new Error("Faltam chaves Supabase.");
    const supabase = createClient(settings.supabaseUrl, settings.supabaseKey);
    const { data, error } = await supabase.storage.from('automation_assets').upload(`${Date.now()}_${filename}`, buffer, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error(error.message);
    const { data: signed } = await supabase.storage.from('automation_assets').createSignedUrl(data.path, 315360000); // 10 anos
    return signed.signedUrl;
}

async function uploadToCloudinary(b, s) {
    configureCloudinary(s);
    let uri = Buffer.isBuffer(b) ? `data:image/jpeg;base64,${b.toString('base64')}` : b;
    if (!uri.startsWith('data:')) uri = `data:image/jpeg;base64,${uri}`;
    const r = await cloudinary.uploader.upload(uri, { folder: "automation_manager_assets", resource_type: "image", type: "upload", access_mode: "public" });
    return r.secure_url;
}

// --- MAIN GENERATOR ---
async function generateMedia(prompt, settings, logFn = null) {
    console.log(`\n[DEBUG] 🚀 generateMedia | Format: ${settings.activeFormat}`);

    // --- FLUXO 1: PDF ---
    if (settings.activeFormat === 'pdf' && !settings.forceImageGeneration) {
        if (settings.activePdfStrategy === 'manual') {
            return { imageUrl: '', modelUsed: 'Aguardando Upload', mediaType: 'pdf' };
        }

        // Busca o PDF usando o novo módulo
        const pdfResult = await findValidPdf(prompt, settings);

        // REGRA DE NEGÓCIO: Se não achar, aborta o post!
        if (!pdfResult) {
            console.error(`[CRITICAL] ❌ Nenhum PDF encontrado para: "${prompt}"`);
            if (logFn) await logFn('warn', '⛔ POST ABORTADO: Nenhum PDF válido encontrado.', prompt);
            
            // Lança erro específico para o gemini.js capturar
            throw new Error("PDF_NOT_FOUND"); 
        }

        // Se achou, faz o upload
        try {
            const url = await uploadToSupabase(pdfResult.buffer, `paper_${Math.random().toString(36).substring(7)}.pdf`, settings);
            return {
                imageUrl: url, // No sistema, imageUrl armazena o link do PDF também
                originalUrl: pdfResult.meta.originalUrl,
                modelUsed: pdfResult.meta.modelUsed,
                mediaType: 'pdf',
                metaTitle: pdfResult.meta.metaTitle,
                metaAbstract: pdfResult.meta.metaAbstract,
                pdfBase64: pdfResult.buffer.toString('base64')
            };
        } catch (e) {
            throw new Error(`Erro Upload PDF: ${e.message}`);
        }
    }

    // --- FLUXO 2: IMAGEM ---
    try {
        let buffer;
        let usedModel = "Pollinations (Flux)";

        if (settings.imageProvider === 'imagen' && settings.geminiApiKey) {
            try {
                buffer = await generateGeminiImage(prompt, settings.geminiApiKey);
                usedModel = "Gemini 3 Pro Image";
            } catch (err) {
                console.log(`[DEBUG] ⚠️ Fallback para Pollinations...`);
                if(logFn) await logFn('warn', `Fallback Imagem`, err.message);
                buffer = await generatePollinationsImage(prompt);
            }
        } else {
            buffer = await generatePollinationsImage(prompt);
        }

        const url = await uploadToCloudinary(buffer, settings);
        return { imageUrl: url, modelUsed: usedModel, mediaType: 'image' };

    } catch (e) {
        console.error("❌ Erro Imagem:", e);
        return { imageUrl: "", modelUsed: "Failed", mediaType: 'image' };
    }
}

async function searchUnsplash(q, s) { return []; } 

module.exports = { generateMedia, uploadToCloudinary, searchUnsplash };