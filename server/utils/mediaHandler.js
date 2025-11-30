const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js');
const zlib = require('zlib');
const { PassThrough } = require('stream');

// --- CONFIGURAÇÃO ---
function configureCloudinary(settings) {
    if (!settings.cloudinaryCloudName) throw new Error("Faltam chaves Cloudinary.");
    cloudinary.config({
        cloud_name: settings.cloudinaryCloudName,
        api_key: settings.cloudinaryApiKey,
        api_secret: settings.cloudinaryApiSecret
    });
}

async function uploadToSupabase(buffer, filename, settings) {
    if (!settings.supabaseUrl || !settings.supabaseKey) throw new Error("Faltam chaves Supabase.");
    const supabase = createClient(settings.supabaseUrl, settings.supabaseKey);
    const { data, error } = await supabase.storage.from('automation_assets').upload(`${Date.now()}_${filename}`, buffer, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error(error.message);
    const { data: signed } = await supabase.storage.from('automation_assets').createSignedUrl(data.path, 315360000);
    return signed.signedUrl;
}

async function uploadMedia(b, s, f) {
    if (f === 'pdf') {
        let buf = Buffer.isBuffer(b) ? b : Buffer.from(b.replace(/^data:.*;base64,/, ""), 'base64');
        return await uploadToSupabase(buf, `paper_${Math.random().toString(36).substring(7)}.pdf`, s);
    }
    configureCloudinary(s);
    let uri = Buffer.isBuffer(b) ? `data:image/jpeg;base64,${b.toString('base64')}` : b;
    if (!uri.startsWith('data:')) uri = `data:image/jpeg;base64,${uri}`;
    const r = await cloudinary.uploader.upload(uri, { folder: "automation_manager_assets", resource_type: "image", type: "upload", access_mode: "public" });
    return r.secure_url;
}

// --- DOWNLOAD BLINDADO (CAMUFLAGEM DE BROWSER) ---
async function downloadPdfSmart(url) {
    console.log(`⬇️ Baixando: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            decompress: false, 
            timeout: 45000,
            maxContentLength: 30 * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            }
        });

        let buffer = response.data;
        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
            try { buffer = zlib.gunzipSync(buffer); } catch (e) {}
        }
        const headerStr = buffer.toString('utf-8', 0, 5);
        if (!headerStr.startsWith('%PDF-')) {
            throw new Error(`Arquivo corrompido ou inválido. Header: '${headerStr}'`);
        }
        return buffer;
    } catch (e) {
        const status = e.response?.status ? `(Status ${e.response.status})` : '';
        throw new Error(`Erro Download ${status}: ${e.message}`);
    }
}

function cleanQuery(q) { return q.replace(/[^\w\s]/gi, '').split(' ').filter(w => w.length > 2).join(' '); }

// --- BUSCADORES (MANTIDOS) ---
async function searchArxiv(query, yearFilter) { 
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 ArXiv: "${q}" (${year}+)...`);
    const dateFilter = `submittedDate:[${year}01010000 TO ${year+2}12312359]`;
    const res = await axios.get(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)} AND ${dateFilter}&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending`, {timeout:8000});
    const entries = res.data.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    for (const entry of entries) {
        const pdfLink = entry.match(/<link\s+title="pdf"\s+href="([^"]+)"/);
        const title = entry.match(/<title>([\s\S]*?)<\/title>/);
        if (pdfLink && title) {
            let url = pdfLink[1].replace('/abs/', '/pdf/');
            if (!url.endsWith('.pdf')) url += '.pdf';
            return { pdfUrl: url, title: title[1].replace(/\n/g, '').trim(), abstract: "Abstract", source: `ArXiv (${year}+)` };
        }
    }
    throw new Error("ArXiv: Nada recente com PDF.");
}

async function searchOpenAlex(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 OpenAlex: "${q}" (${year}+)...`);
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=from_publication_date:${year}-01-01,has_fulltext:true,open_access.is_oa:true&per-page=1`;
    const res = await axios.get(url, { timeout: 8000 });
    const w = res.data.results?.[0];
    if (!w || !w.best_oa_location?.pdf_url) throw new Error("OpenAlex: Nada encontrado.");
    return { pdfUrl: w.best_oa_location.pdf_url, title: w.title, abstract: "Ver PDF.", source: `OpenAlex (${w.publication_year})` };
}

async function searchPlos(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 PLOS: "${q}" (${year}+)...`);
    const dateQ = `publication_date:[${year}-01-01T00:00:00Z TO *]`;
    const res = await axios.get(`https://api.plos.org/search?q=title:"${encodeURIComponent(q)}" AND ${dateQ}&fl=id,title_display,abstract&wt=json&rows=1`, { timeout: 8000 });
    const doc = res.data.response.docs[0];
    if (!doc) throw new Error("PLOS: Nada encontrado.");
    return { pdfUrl: `https://journals.plos.org/plosone/article/file?id=${doc.id}&type=printable`, title: doc.title_display, abstract: "N/A", source: `PLOS (${year}+)` };
}

async function searchSemanticScholar(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 Semantic: "${q}" (${year}+)...`);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&year=${year}-${year+2}&limit=1&fields=title,abstract,isOpenAccess,openAccessPdf`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data.data?.[0];
    if (!data?.openAccessPdf?.url) throw new Error("Semantic: Nada encontrado.");
    return { pdfUrl: data.openAccessPdf.url, title: data.title, abstract: data.abstract, source: `Semantic (${year}+)` };
}

async function searchDOAJ(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 DOAJ: "${q}" (${year}+)...`);
    const res = await axios.get(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=5&sort=relevance`, { timeout: 8000 });
    for (const item of res.data.results || []) {
        if (parseInt(item.bibjson.year) >= year) {
            const link = item.bibjson.link?.find(l => l.type === 'fulltext' && l.url.endsWith('.pdf'));
            if (link) return { pdfUrl: link.url, title: item.bibjson.title, abstract: "N/A", source: `DOAJ (${item.bibjson.year})` };
        }
    }
    throw new Error("DOAJ: Nada recente com PDF.");
}

async function searchPubMedCentral(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 PubMed: "${q}" (${year}+)...`);
    const term = `${encodeURIComponent(q)} AND open access[filter] AND ${year}:${year+2}[dp]`;
    const sRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${term}&retmode=json&retmax=1`, { timeout: 8000 });
    const id = sRes.data.esearchresult?.idlist?.[0];
    if (!id) throw new Error("PubMed: Nada encontrado.");
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
    if (!doc) throw new Error("ERIC: Nada encontrado.");
    return { pdfUrl: `https://files.eric.ed.gov/fulltext/${doc.id}.pdf`, title: doc.title, abstract: doc.description, source: `ERIC (${year}+)` };
}

async function searchPapersWithCode(query, yearFilter) {
    const q = cleanQuery(query);
    const year = parseInt(yearFilter) || 2024;
    console.log(`📚 PapersWithCode: "${q}"...`);
    const res = await axios.get(`https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(q)}&items_per_page=3`, { timeout: 8000 });
    for (const r of res.data.results || []) {
        if (r.url_pdf && r.published && new Date(r.published).getFullYear() >= year) {
            return { pdfUrl: r.url_pdf, title: r.title, abstract: r.abstract, source: `PWC (${r.published.substring(0,4)})` };
        }
    }
    throw new Error(`PWC: Nada de ${year}+.`);
}

// ORQUESTRADOR DE PDF
async function searchAndUploadPdf(query, settings, logFn) {
    const strategies = [searchOpenAlex, searchPlos, searchArxiv, searchSemanticScholar, searchDOAJ, searchPubMedCentral, searchEric, searchPapersWithCode];
    const year = settings.pdfDateFilter || '2024';

    for (const strategy of strategies) {
        try {
            const data = await strategy(query, year);
            console.log(`✅ Encontrado [${data.source}]: ${data.title}`);
            const buffer = await downloadPdfSmart(data.pdfUrl);
            const url = await uploadMedia(buffer, settings, 'pdf');
            return { 
                imageUrl: url, 
                originalUrl: data.pdfUrl, 
                modelUsed: data.source, 
                mediaType: 'pdf', 
                metaTitle: data.title, 
                metaAbstract: data.abstract, 
                pdfBase64: buffer.toString('base64') 
            };
        } catch (e) {
            const msg = e.message.length > 100 ? e.message.substring(0, 100) + '...' : e.message;
            console.warn(`⚠️ Descartado (${strategy.name}): ${msg}`);
        }
    }
    
    if(logFn) await logFn('warn', 'Nenhum PDF válido encontrado nos 8 portais.', query);
    return { imageUrl: "", originalUrl: "", modelUsed: "Not Found", mediaType: 'pdf', manualRequired: true, metaTitle: `Nenhum PDF (${year}+)`, metaAbstract: "Tente mudar o tópico." };
}

// --- GERAÇÃO DE IMAGEM (REVISADA) ---

// Função que replica o script PowerShell (usando :generateContent)
async function callGeminiImagePreview(prompt, apiKey) {
    const modelName = "gemini-3-pro-image-preview";
    console.log(`[DEBUG] 🔹 Tentando Google Model: ${modelName} (via generateContent)`);
    
    // URL EXATA do Script PowerShell
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    // Payload simplificado (igual ao do Script)
    const body = {
        contents: [
            {
                parts: [
                    { text: prompt }
                ]
            }
        ]
    };

    try {
        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 45000
        });

        // Parse da resposta (igual ao script: procura por inlineData)
        // Estrutura: candidates[0].content.parts[0].inlineData.data
        const candidate = response.data.candidates?.[0];
        const part = candidate?.content?.parts?.[0];
        
        if (part?.inlineData?.data) {
            console.log(`[DEBUG] ✅ Sucesso! Imagem gerada (${part.inlineData.data.length} bytes)`);
            return Buffer.from(part.inlineData.data, 'base64');
        } else if (part?.text) {
            console.warn(`[DEBUG] ⚠️ Modelo retornou texto ao invés de imagem: "${part.text.substring(0,50)}..."`);
            throw new Error("Modelo retornou texto, não imagem.");
        } else {
            throw new Error("Resposta da API vazia ou formato inesperado.");
        }

    } catch (error) {
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message;
        console.error(`[DEBUG] ❌ Erro API Gemini (${status}): ${msg}`);
        throw error;
    }
}

// Fallback: Pollinations (Flux)
async function generateWithPollinations(prompt) {
    console.log("[DEBUG] 🔹 Tentando Fallback: Pollinations (Flux)");
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.random()}`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 40000 });
    return Buffer.from(res.data);
}

// --- ORQUESTRADOR DE MÍDIA ---
async function generateMedia(prompt, settings, logFn = null) {
    console.log(`\n[DEBUG] 🚀 generateMedia | Format: ${settings.activeFormat} | Provider: ${settings.imageProvider}`);

    // Fluxo PDF
    if (settings.activeFormat === 'pdf' && !settings.forceImageGeneration) {
        if (settings.activePdfStrategy === 'manual') return { imageUrl: '', modelUsed: 'Aguardando Upload', mediaType: 'pdf' };
        return await searchAndUploadPdf(prompt, settings, logFn);
    }

    // Fluxo Imagem
    try {
        let buffer;
        let usedModel = "Pollinations (Flux)";

        // Se o usuário escolheu 'imagen' (que agora engloba Gemini Image), tentamos a hierarquia Google
        if (settings.imageProvider === 'imagen' && settings.geminiApiKey) {
            try {
                // TENTATIVA 1: Gemini 3 Pro Image Preview (Estilo Script PowerShell)
                buffer = await callGeminiImagePreview(prompt, settings.geminiApiKey);
                usedModel = "Gemini 3 Pro Image";
            
            } catch (errPreview) {
                console.log(`[DEBUG] ⚠️ Falha no Gemini Preview. Caindo para Pollinations.`);
                if(logFn) await logFn('warn', `Falha Google Image -> Fallback Pollinations`, errPreview.message);
                
                // TENTATIVA 2: Pollinations
                buffer = await generateWithPollinations(prompt);
                usedModel = "Pollinations (Flux)";
            }
        } else {
            // Se não configurou chave ou provider, vai direto pro Pollinations
            buffer = await generateWithPollinations(prompt);
        }

        console.log("[DEBUG] 📤 Enviando para Cloudinary...");
        const url = await uploadMedia(buffer, settings, 'image');
        console.log(`[DEBUG] ✅ URL Final: ${url}`);
        
        return { imageUrl: url, modelUsed: usedModel, mediaType: 'image' };

    } catch (e) {
        console.error("[DEBUG] ❌ Erro FATAL na geração de imagem:", e);
        if(logFn) await logFn('error', 'Falha Geração Imagem', e.message);
        return { imageUrl: "", modelUsed: "Failed", mediaType: 'image' };
    }
}

async function searchUnsplash(q, s) { return []; } 

module.exports = { generateMedia, uploadToCloudinary: uploadMedia, searchUnsplash, searchAndUploadPdf };
