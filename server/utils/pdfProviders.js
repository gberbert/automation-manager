const axios = require('axios');
const zlib = require('zlib');

// --- DOWNLOADER BLINDADO ---
async function downloadPdfSmart(url) {
    console.log(`⬇️ Baixando: ${url}`);
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            decompress: false, 
            timeout: 45000,
            maxContentLength: 30 * 1024 * 1024, // Limite de 30MB
            headers: {
                // Headers otimizados para parecer um navegador real
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            }
        });

        let buffer = response.data;
        // Tratamento de GZIP manual se necessário
        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
            try { buffer = zlib.gunzipSync(buffer); } catch (e) {}
        }

        // VERIFICAÇÃO CRÍTICA: É realmente um PDF?
        const headerStr = buffer.toString('utf-8', 0, 15); // Lê os primeiros 15 bytes
        if (!headerStr.startsWith('%PDF-')) {
            // Se retornou HTML (<!DOCTYPE...), é bloqueio ou erro
            const isHtml = headerStr.trim().startsWith('<') || headerStr.includes('html');
            const msg = isHtml ? "Site retornou HTML (Bloqueio Anti-Bot/Cloudflare)" : `Header desconhecido: '${headerStr.substring(0, 10)}...'`;
            throw new Error(msg);
        }
        return buffer;
    } catch (e) {
        // Formata erro do Axios
        const status = e.response?.status ? `(HTTP ${e.response.status})` : '';
        throw new Error(`Erro Download ${status}: ${e.message}`);
    }
}

function cleanQuery(q) { return q.replace(/[^\w\s]/gi, '').split(' ').filter(w => w.length > 2).join(' '); }

// --- BUSCADORES INDIVIDUAIS ---

async function searchArxiv(query, year) { 
    const q = cleanQuery(query);
    console.log(`📚 ArXiv: "${q}" (${year}+)...`);
    const dateFilter = `submittedDate:[${year}01010000 TO ${parseInt(year)+2}12312359]`;
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
    throw new Error("Nada encontrado no ArXiv.");
}

async function searchOpenAlex(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 OpenAlex: "${q}" (${year}+)...`);
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=from_publication_date:${year}-01-01,has_fulltext:true,open_access.is_oa:true&per-page=1`;
    const res = await axios.get(url, { timeout: 8000 });
    const w = res.data.results?.[0];
    if (!w || !w.best_oa_location?.pdf_url) throw new Error("Nada encontrado no OpenAlex.");
    return { pdfUrl: w.best_oa_location.pdf_url, title: w.title, abstract: "Ver PDF.", source: `OpenAlex (${w.publication_year})` };
}

async function searchPlos(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 PLOS: "${q}" (${year}+)...`);
    const dateQ = `publication_date:[${year}-01-01T00:00:00Z TO *]`;
    const res = await axios.get(`https://api.plos.org/search?q=title:"${encodeURIComponent(q)}" AND ${dateQ}&fl=id,title_display,abstract&wt=json&rows=1`, { timeout: 8000 });
    const doc = res.data.response.docs[0];
    if (!doc) throw new Error("Nada encontrado no PLOS.");
    return { pdfUrl: `https://journals.plos.org/plosone/article/file?id=${doc.id}&type=printable`, title: doc.title_display, abstract: "N/A", source: `PLOS (${year}+)` };
}

async function searchSemanticScholar(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 Semantic: "${q}" (${year}+)...`);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&year=${year}-${parseInt(year)+2}&limit=1&fields=title,abstract,isOpenAccess,openAccessPdf`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data.data?.[0];
    if (!data?.openAccessPdf?.url) throw new Error("Nada encontrado no Semantic Scholar.");
    return { pdfUrl: data.openAccessPdf.url, title: data.title, abstract: data.abstract, source: `Semantic (${year}+)` };
}

async function searchDOAJ(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 DOAJ: "${q}" (${year}+)...`);
    const res = await axios.get(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=5&sort=relevance`, { timeout: 8000 });
    for (const item of res.data.results || []) {
        if (parseInt(item.bibjson.year) >= parseInt(year)) {
            const link = item.bibjson.link?.find(l => l.type === 'fulltext' && l.url.endsWith('.pdf'));
            if (link) return { pdfUrl: link.url, title: item.bibjson.title, abstract: "N/A", source: `DOAJ (${item.bibjson.year})` };
        }
    }
    throw new Error("Nada encontrado no DOAJ.");
}

async function searchPubMed(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 PubMed: "${q}" (${year}+)...`);
    const term = `${encodeURIComponent(q)} AND open access[filter] AND ${year}:${parseInt(year)+2}[dp]`;
    const sRes = await axios.get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=${term}&retmode=json&retmax=1`, { timeout: 8000 });
    const id = sRes.data.esearchresult?.idlist?.[0];
    if (!id) throw new Error("Nada encontrado no PubMed.");
    return { pdfUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${id.replace('PMC', '')}/pdf/`, title: "Medical Paper", abstract: "N/A", source: `PubMed (${year}+)` };
}

async function searchEric(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 ERIC: "${q}" (${year}+)...`);
    const range = `(pubyear:${year} OR pubyear:${parseInt(year)+1})`;
    const term = `${encodeURIComponent(q)} AND ${range} AND e_fulltext_auth:T`;
    const res = await axios.get(`https://api.ies.ed.gov/eric/?search=${term}&format=json&rows=1`, { timeout: 8000 });
    const doc = res.data.response.docs?.[0];
    if (!doc) throw new Error("Nada encontrado no ERIC.");
    return { pdfUrl: `https://files.eric.ed.gov/fulltext/${doc.id}.pdf`, title: doc.title, abstract: doc.description, source: `ERIC (${year}+)` };
}

async function searchPapersWithCode(query, year) {
    const q = cleanQuery(query);
    console.log(`📚 PapersWithCode: "${q}"...`);
    const res = await axios.get(`https://paperswithcode.com/api/v1/papers/?q=${encodeURIComponent(q)}&items_per_page=3`, { timeout: 8000 });
    for (const r of res.data.results || []) {
        if (r.url_pdf && r.published && new Date(r.published).getFullYear() >= parseInt(year)) {
            return { pdfUrl: r.url_pdf, title: r.title, abstract: r.abstract, source: `PWC (${r.published.substring(0,4)})` };
        }
    }
    throw new Error("Nada encontrado no PWC.");
}

// --- ORQUESTRADOR DE BUSCA (Apenas busca, não salva) ---
async function findValidPdf(query, settings) {
    const strategies = [
        searchArxiv, // ArXiv costuma ser o mais amigável para download direto
        searchSemanticScholar, 
        searchOpenAlex, 
        searchPlos, 
        searchDOAJ, 
        searchPubMed, 
        searchEric, 
        searchPapersWithCode
    ];
    
    const year = settings.pdfDateFilter || '2024';

    for (const strategy of strategies) {
        let currentSource = strategy.name;
        try {
            const data = await strategy(query, year);
            currentSource = data.source; // Atualiza com o nome real retornado
            
            console.log(`✅ Encontrado Metadata [${currentSource}]: ${data.title}`);
            
            // Tenta baixar para garantir que é válido
            const buffer = await downloadPdfSmart(data.pdfUrl);
            
            return { 
                buffer: buffer,
                meta: {
                    originalUrl: data.pdfUrl,
                    modelUsed: data.source,
                    metaTitle: data.title,
                    metaAbstract: data.abstract
                }
            };
        } catch (e) {
            // AQUI ESTÁ O LOG QUE FALTAVA: Mostra por que falhou, mas não para o loop
            console.warn(`[DEBUG] ⚠️ Falha ao processar ${currentSource}: ${e.message}`);
        }
    }
    return null; // Retorna nulo se falhar em todos
}

module.exports = { findValidPdf };
