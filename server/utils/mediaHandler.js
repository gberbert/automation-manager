const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js');
const zlib = require('zlib'); 
const { PassThrough } = require('stream');

function configureCloudinary(settings) {
    if (!settings.cloudinaryCloudName || !settings.cloudinaryApiKey || !settings.cloudinaryApiSecret) {
        throw new Error("Faltam chaves do Cloudinary.");
    }
    cloudinary.config({
        cloud_name: settings.cloudinaryCloudName,
        api_key: settings.cloudinaryApiKey,
        api_secret: settings.cloudinaryApiSecret
    });
}

async function uploadToSupabase(buffer, filename, settings) {
    if (!settings.supabaseUrl || !settings.supabaseKey) {
        throw new Error("Faltam chaves do Supabase em Settings.");
    }
    const supabase = createClient(settings.supabaseUrl, settings.supabaseKey);
    const bucketName = 'automation_assets'; 
    const { data, error } = await supabase.storage.from(bucketName).upload(`${Date.now()}_${filename}`, buffer, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error(`Supabase Upload Error: ${error.message}`);
    const { data: signedData, error: signError } = await supabase.storage.from(bucketName).createSignedUrl(data.path, 315360000);
    if (signError) throw new Error(`Erro ao gerar link assinado: ${signError.message}`);
    return signedData.signedUrl;
}

async function uploadMedia(bufferOrBase64, settings, format = 'jpg') {
    if (format === 'pdf') {
        console.log("☁️ Uploading PDF to Supabase...");
        let buffer;
        if (Buffer.isBuffer(bufferOrBase64)) {
            buffer = bufferOrBase64;
        } else if (typeof bufferOrBase64 === 'string') {
            const cleanBase64 = bufferOrBase64.replace(/^data:.*;base64,/, "");
            buffer = Buffer.from(cleanBase64, 'base64');
        } else {
            throw new Error("Buffer inválido.");
        }
        const randomName = `paper_${Math.random().toString(36).substring(7)}.pdf`;
        return await uploadToSupabase(buffer, randomName, settings);
    }

    console.log("☁️ Uploading Image to Cloudinary...");
    configureCloudinary(settings);
    
    let dataURI;
    if (Buffer.isBuffer(bufferOrBase64)) {
        dataURI = `data:image/jpeg;base64,${bufferOrBase64.toString('base64')}`;
    } else {
        dataURI = bufferOrBase64.startsWith('data:') ? bufferOrBase64 : `data:image/jpeg;base64,${bufferOrBase64}`;
    }

    const result = await cloudinary.uploader.upload(dataURI, {
        folder: "automation_manager_assets",
        resource_type: "image",
        type: "upload",
        access_mode: "public"
    });
    return result.secure_url;
}

async function downloadPdfSmart(url) {
    console.log(`⬇️ Baixando: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            decompress: false, 
            timeout: 45000, 
            maxContentLength: 30 * 1024 * 1024,
            headers: {
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Referer': 'https://www.google.com/'
            }
        });

        let buffer = response.data;
        const headerHex = buffer.toString('hex', 0, 2); 
        if (headerHex === '1f8b') {
            try { buffer = zlib.gunzipSync(buffer); } catch (e) {}
        }

        let startTrim = 0;
        while (startTrim < 100 && startTrim < buffer.length) {
            const byte = buffer[startTrim];
            if (byte === 32 || byte === 9 || byte === 13 || byte === 10) startTrim++;
            else break;
        }
        if (startTrim > 0) buffer = buffer.subarray(startTrim);

        const headerStr = buffer.toString('utf-8', 0, 5);
        if (!headerStr.startsWith('%PDF-')) {
            throw new Error(`Arquivo INVÁLIDO. Header: '${headerStr}'.`);
        }
        return buffer;
    } catch (e) {
        if (e.message.includes('maxContentLength')) throw new Error(`PDF ignorado: >30MB.`);
        throw new Error(`Erro download: ${e.message}`);
    }
}

function cleanQuery(query) {
    if (!query) return "";
    let cleaned = query.replace(/[^\w\s]/gi, '');
    const stopWords = ['the', 'a', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'impact', 'analysis'];
    return cleaned.split(' ').filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase())).join(' ');
}

// --- BUSCADORES ---
async function searchPapersWithCode(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 PapersWithCode: "${q}"...`);
    const url = `https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(q)}&items_per_page=3`;
    const res = await axios.get(url, { timeout: 8000 });
    for (const r of res.data.results || []) {
        if (r.url_pdf && r.published) {
            const pubYear = new Date(r.published).getFullYear();
            if (pubYear >= year) {
                 return { pdfUrl: r.url_pdf, title: r.title, abstract: r.abstract, source: `PWC (${pubYear})` };
            }
        }
    }
    throw new Error("PWC: Nada de 2024+.");
}

async function searchArxiv(query, yearFilter) { 
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 ArXiv: "${q}" (${year}+)...`);
    const dateFilter = `submittedDate:[${year}01010000 TO ${year+2}12312359]`;
    const res = await axios.get(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)} AND ${dateFilter}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending`, {timeout:8000});
    const link = res.data.match(/<link\s+[^>]*title="pdf"[^>]*href="([^"]+)"/i);
    if(!link) throw new Error("ArXiv: Nada.");
    let pdfUrl = link[1].replace('/abs/','/pdf/') + '.pdf';
    const title = res.data.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\n/g, '').trim() || "Paper";
    return { pdfUrl, title, abstract: "Abstract", source: `ArXiv (${year}+)` };
}

async function searchSemanticScholar(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 Semantic: "${q}" (${year}+)...`);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&year=${year}-${year+2}&limit=1&fields=title,abstract,isOpenAccess,openAccessPdf`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data.data?.[0];
    if (!data?.openAccessPdf?.url) throw new Error("Semantic: Nada.");
    return { pdfUrl: data.openAccessPdf.url, title: data.title, abstract: data.abstract, source: `Semantic (${year}+)` };
}

async function searchPubMedCentral(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 PubMed: "${q}" (${year}+)...`);
    const term = `${encodeURIComponent(q)} AND open access[filter] AND ${year}:${year+2}[dp]`;
    const sRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${term}&retmode=json&retmax=1`, { timeout: 8000 });
    const id = sRes.data.esearchresult?.idlist?.[0];
    if (!id) throw new Error("PubMed: Nada.");
    return { pdfUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id.replace('PMC', '')}/pdf/`, title: "Medical Paper", abstract: "N/A", source: `PubMed (${year}+)` };
}

async function searchEric(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 ERIC: "${q}" (${year}+)...`);
    const range = `(pubyear:${year} OR pubyear:${year+1})`;
    const term = `${encodeURIComponent(q)} AND ${range} AND e_fulltext_auth:T`;
    const res = await axios.get(`https://api.ies.ed.gov/eric/?search=${term}&format=json&rows=1`, { timeout: 8000 });
    const doc = res.data.response.docs?.[0];
    if (!doc) throw new Error("ERIC: Nada.");
    return { pdfUrl: `https://files.eric.ed.gov/fulltext/${doc.id}.pdf`, title: doc.title, abstract: doc.description, source: `ERIC (${year}+)` };
}

// ORQUESTRADOR
async function searchAndUploadPdf(query, settings, logFn) {
    const strategies = [searchArxiv, searchSemanticScholar, searchPubMedCentral, searchEric, searchPapersWithCode]; 
    const year = settings.pdfDateFilter || '2024';

    for (const strategy of strategies) {
        try {
            const data = await strategy(query, year);
            console.log(`✅ Encontrado: ${data.title}`);
            const buffer = await downloadPdfSmart(data.pdfUrl);
            const url = await uploadMedia(buffer, settings, 'pdf');
            return { imageUrl: url, originalUrl: data.pdfUrl, modelUsed: data.source, mediaType: 'pdf', metaTitle: data.title, metaAbstract: data.abstract, pdfBase64: buffer.toString('base64') };
        } catch (e) {
            // console.log(e.message);
        }
    }
    return { imageUrl: "", originalUrl: "", modelUsed: "Not Found", mediaType: 'pdf', manualRequired: true, metaTitle: `Nenhum PDF (${year}+)`, metaAbstract: "Tente mudar o tópico." };
}

// GERAÇÃO DE IMAGEM (IMAGEN 3)
async function generateWithImagen(prompt, settings) {
    if (!settings.geminiApiKey) throw new Error("Falta Key");
    console.log("🎨 Solicitando imagem ao Google Imagen 3...");
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" }); 
    
    // CLEAN PROMPT: Remove textos muito longos que possam ser recusas do modelo de texto
    const cleanPrompt = prompt.length > 400 ? prompt.substring(0, 400) : prompt;

    try {
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: cleanPrompt }] }] });
        const imagePart = result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (imagePart?.data) return Buffer.from(imagePart.data, 'base64');
        throw new Error("Sem dados binários");
    } catch (e) { throw e; }
}

async function generateWithPollinations(prompt) {
    const safePrompt = encodeURIComponent(prompt.substring(0, 300) + " 8k photorealistic");
    const url = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.random()}`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 40000 });
    return Buffer.from(res.data);
}

async function generateMedia(prompt, settings, logFn = null) {
    if (settings.activeFormat === 'pdf') {
        if (settings.activePdfStrategy === 'manual') return { imageUrl: '', modelUsed: 'Aguardando Upload', mediaType: 'pdf' };
        return await searchAndUploadPdf(prompt, settings, logFn);
    }
    try {
        const buffer = await generateWithImagen(prompt, settings);
        const url = await uploadMedia(buffer, settings, 'image');
        return { imageUrl: url, modelUsed: "Gemini 3 Pro Image", mediaType: 'image' };
    } catch (e) {
        console.warn(`⚠️ Imagen falhou. Usando Pollinations...`);
        try {
            const bufferP = await generateWithPollinations(prompt);
            const urlP = await uploadMedia(bufferP, settings, 'image');
            return { imageUrl: urlP, modelUsed: "Pollinations (Flux)", mediaType: 'image' };
        } catch (errP) { return { imageUrl: "", modelUsed: "Failed", mediaType: 'image' }; }
    }
}
async function searchUnsplash(q, s) { return []; }
module.exports = { generateMedia, uploadToCloudinary: uploadMedia, searchUnsplash, searchAndUploadPdf };