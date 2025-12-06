import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Share2, Image as ImageIcon, AlertTriangle, PenTool, MessageCircle, Copy, X, Loader2, Target, Wand2, Upload } from 'lucide-react';

export default function Repost() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Dados de entrada
    const [incomingText, setIncomingText] = useState('');
    const [incomingLink, setIncomingLink] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);

    // Configurações e Contextos
    const [settings, setSettings] = useState(null);
    const [selectedAction, setSelectedAction] = useState(null); // 'authorial' | 'repost' | 'comment'
    const [selectedContext, setSelectedContext] = useState('');

    // Estados de Geração
    const [loadingAction, setLoadingAction] = useState(null); // 'authorial' | 'reaction'
    const [generatedText, setGeneratedText] = useState('');
    const [showResultModal, setShowResultModal] = useState(false);

    useEffect(() => {
        // 1. Processa parâmetros da URL
        const text = searchParams.get('text') || '';
        const title = searchParams.get('title') || '';
        const url = searchParams.get('url') || '';
        setIncomingText(text || title); // Prefer text, fallback to title

        // Lógica de URL: Imagem ou Link?
        if (url) {
            if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                setSelectedImage(url);
            } else {
                setIncomingLink(url);
            }
        } else {
            // Tenta achar imagem e link no texto
            const imgMatch = text.match(/(https?:\/\/[^\s]+?\.(?:jpeg|jpg|gif|png|webp))/i);
            if (imgMatch) setSelectedImage(imgMatch[0]);

            const linkMatch = text.match(/(https?:\/\/[^\s]+)/i);
            if (linkMatch && !imgMatch) setIncomingLink(linkMatch[0]); // Só pega se não for a imagem
        }

        // 2. Carrega configurações para ter os contextos
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'settings', 'global');
                const snap = await getDoc(docRef);
                if (snap.exists()) setSettings(snap.data());
            } catch (e) { console.error("Erro ao carregar settings", e); }
        };
        fetchSettings();

        // 3. Paste Handler
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        const blob = items[i].getAsFile();
                        const reader = new FileReader();
                        reader.onload = (ev) => setSelectedImage(ev.target.result);
                        reader.readAsDataURL(blob);
                        break;
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [searchParams]);

    // 4. SHARE TARGET CHECK (PWA)
    useEffect(() => {
        const checkSharedContent = async () => {
            if (searchParams.get('shared') === 'true') {
                try {
                    console.log("📥 Verificando conteúdo compartilhado via PWA...");
                    // Abrir IDB
                    const db = await new Promise((resolve, reject) => {
                        const req = indexedDB.open('share-target', 1);
                        req.onsuccess = (e) => resolve(e.target.result);
                        req.onerror = (e) => reject(e);
                    });

                    // Ler dados
                    const tx = db.transaction('shares', 'readwrite');
                    const store = tx.objectStore('shares');
                    const req = store.get('latest');

                    req.onsuccess = () => {
                        const data = req.result;
                        if (data) {
                            console.log("📦 Dados encontrados no IDB:", data);

                            // 1. Define texto/URL
                            const textContent = data.text || '';
                            if (textContent) setIncomingText(textContent);

                            // Lógica inteligente para extrair Link
                            let foundLink = data.url;

                            // Se a URL do share estiver vazia (comum no Android), tenta achar no texto
                            if (!foundLink && textContent) {
                                const linkMatch = textContent.match(/(https?:\/\/[^\s]+)/i);
                                if (linkMatch) foundLink = linkMatch[0];
                            }

                            if (foundLink && !foundLink.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                                setIncomingLink(foundLink);
                            }

                            // 2. Define Imagem (Blob para DataURL)
                            if (data.file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => setSelectedImage(ev.target.result);
                                reader.readAsDataURL(data.file);
                            }

                            // 3. Importante: Limpar para não recarregar no futuro
                            store.delete('latest');

                            // Limpa URL da flag ?shared=true
                            navigate('/repost', { replace: true });
                        }
                    };
                } catch (e) {
                    console.error("Erro ao recuperar share:", e);
                }
            }
        };
        checkSharedContent();
    }, [searchParams]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // AÇÃO 1: POST AUTORAL
    const handleAuthorialPost = async () => {
        setLoadingAction('authorial');
        try {
            const getApiUrl = (ep) => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `http://localhost:3000/api/${ep}` : `/api/${ep}`;

            // Combine text for manual topic, but send link separately
            let topic = incomingText || (selectedImage ? "Análise da Imagem" : "");

            const response = await fetch(getApiUrl('generate-content'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    format: 'image',
                    manualTopic: topic,
                    manualImage: selectedImage,
                    manualLink: incomingLink // Send link explicitly
                })
            });
            const result = await response.json();
            if (result.success) {
                alert("✅ Post Autoral criado em 'Approvals'!");
                navigate('/approvals');
            } else {
                alert(`Erro: ${result.error}`);
            }
        } catch (e) { alert("Erro de conexão."); }
        setLoadingAction(null);
    };

    // AÇÃO 2 e 3: RE-POST ou COMMENT
    const handleReaction = async () => {
        if (!selectedContext) return alert("Selecione um contexto/perfil.");
        setLoadingAction('reaction');
        try {
            const getApiUrl = (ep) => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `http://localhost:3000/api/${ep}` : `/api/${ep}`;

            const response = await fetch(getApiUrl('generate-reaction'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: selectedAction,
                    context: selectedContext,
                    content: incomingText,
                    link: incomingLink,
                    image: selectedImage
                })
            });
            const result = await response.json();
            if (result.success) {
                setGeneratedText(result.text);
                setShowResultModal(true);
            } else {
                alert(`Erro: ${result.error}`);
            }
        } catch (e) { alert("Erro de conexão."); }
        setLoadingAction(null);
    };

    // Renderizador da Seção de Contexto (Repost/Comment)
    const renderContextSelector = (type) => {
        const strategyKey = type === 'repost' ? 'strategyRepost' : 'strategyComment';
        const contexts = settings?.[strategyKey]?.contexts || [];

        return (
            <div className="space-y-4 animate-fadeIn mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <h4 className="text-white font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 text-yellow-400" /> Selecione o Contexto (Perfil)
                </h4>
                {contexts.length === 0 ? (
                    <div className="text-gray-500 text-sm">Nenhum contexto cadastrado em Settings &gt; Prompts &gt; {type}.</div>
                ) : (
                    <div className="space-y-2">
                        {contexts.map((ctx, idx) => {
                            const val = typeof ctx === 'object' ? ctx.text : ctx;
                            return (
                                <label key={idx} className={`flex items-start gap-3 p-3 rounded cursor-pointer border transition-all ${selectedContext === val ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                                    <input type="radio" name="context" value={val} onChange={(e) => setSelectedContext(e.target.value)} className="mt-1" />
                                    <span className="text-sm text-gray-300">{val}</span>
                                </label>
                            );
                        })}
                    </div>
                )}
                <button
                    onClick={handleReaction}
                    disabled={!selectedContext || loadingAction === 'reaction'}
                    className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 mt-2"
                >
                    {loadingAction === 'reaction' ? <Loader2 className="w-5 h-5 animate-spin" /> : <PenTool className="w-5 h-5" />}
                    Gerar {type === 'repost' ? 'Re-post' : 'Comentário'}
                </button>
            </div>
        );
    };

    // Renderizador da Seção Autoral (Novo)
    const renderAuthorialSection = () => {
        // Obter tópicos disponíveis (Settings Strategy Image -> Topics ou Global Topics)
        const topics = settings?.strategyImage?.topics || settings?.topics || [];

        return (
            <div className="space-y-4 animate-fadeIn mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <h4 className="text-white font-bold flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-blue-400" /> Criar Post Original
                </h4>
                <p className="text-sm text-gray-400">
                    O sistema usará o link compartilhado como <strong>Fonte</strong>.
                    Selecione um tópico abaixo para guiar o tema (ou deixe em branco para usar o texto do link).
                </p>

                {/* Seletor de Tópicos */}
                <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 max-h-40 overflow-y-auto">
                    <label className="text-xs text-gray-400 font-bold mb-2 block sticky top-0 bg-gray-800 pb-1">TÓPICO (Opcional):</label>
                    <div className="space-y-1">
                        <label className="flex items-center gap-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                            <input
                                type="radio"
                                name="topic"
                                value=""
                                checked={incomingText === (searchParams.get('text') || searchParams.get('title') || '')}
                                onChange={() => setIncomingText(searchParams.get('text') || searchParams.get('title') || '')}
                            />
                            <span className="text-sm text-gray-300 italic">Automático (Baseado no Link/Texto)</span>
                        </label>
                        {topics.map((t, i) => (
                            <label key={i} className="flex items-center gap-2 hover:bg-gray-700 p-1 rounded cursor-pointer">
                                <input
                                    type="radio"
                                    name="topic"
                                    value={t}
                                    checked={incomingText === t}
                                    onChange={(e) => setIncomingText(e.target.value)}
                                />
                                <span className="text-sm text-gray-300">{t}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleAuthorialPost}
                    disabled={loadingAction === 'authorial'}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 mt-2"
                >
                    {loadingAction === 'authorial' ? <Loader2 className="w-5 h-5 animate-spin" /> : <PenTool className="w-5 h-5" />}
                    Gerar Post Completo
                </button>
            </div>
        );
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn pb-20">
            {/* CABEÇALHO */}
            <div className="flex items-center gap-3 border-b border-gray-700 pb-4">
                <div className="p-3 bg-blue-600/20 rounded-xl"><Share2 className="w-8 h-8 text-blue-500" /></div>
                <div><h2 className="text-3xl font-bold text-white">Compartilhamento Externo</h2><p className="text-gray-400 text-sm">O que deseja fazer com este conteúdo?</p></div>
            </div>

            {/* CONTEÚDO RECEBIDO */}
            <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-lg">
                    {selectedImage ? (
                        <div className="relative w-full h-48 bg-black/50 rounded-lg overflow-hidden mb-2">
                            <img src={selectedImage} alt="Preview" className="w-full h-full object-contain" />
                            <button onClick={() => setSelectedImage(null)} className="absolute top-2 right-2 bg-red-600 p-1 rounded-full text-white"><X className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-600 rounded-lg mb-2 hover:border-blue-500 transition-colors">
                            <label className="cursor-pointer flex flex-col items-center gap-2 w-full h-full justify-center">
                                <Upload className="w-8 h-8 text-gray-400" />
                                <span className="text-sm text-gray-400">Clique para enviar uma imagem</span>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                            </label>
                        </div>
                    )}
                    <p className="text-gray-400 text-xs mt-2 line-clamp-3 italic">"{incomingText}"</p>
                    <div className="mt-2 flex items-center gap-2 bg-gray-900/50 p-2 rounded border border-gray-700">
                        <span className="text-blue-400 text-xs font-bold whitespace-nowrap">LINK:</span>
                        <input
                            type="text"
                            value={incomingLink}
                            onChange={(e) => setIncomingLink(e.target.value)}
                            placeholder="https://..."
                            className="bg-transparent border-none text-blue-300 text-xs w-full focus:outline-none"
                        />
                    </div>
                </div>

                {/* SELEÇÃO DE AÇÃO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Botão 1: Re-post */}
                    <button onClick={() => { setSelectedAction('repost'); setSelectedContext(''); }} className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${selectedAction === 'repost' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                        <Share2 className="w-8 h-8 mb-1" />
                        <span className="font-bold">Criar Re-post</span>
                        <span className="text-[10px] opacity-70">Opinião sobre a imagem</span>
                    </button>

                    {/* Botão 2: Comentário */}
                    <button onClick={() => { setSelectedAction('comment'); setSelectedContext(''); }} className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${selectedAction === 'comment' ? 'bg-green-600/20 border-green-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                        <MessageCircle className="w-8 h-8 mb-1" />
                        <span className="font-bold">Criar Comentário</span>
                        <span className="text-[10px] opacity-70">Pergunta ou Resposta</span>
                    </button>

                    {/* Botão 3: Post Autoral (Corrigido: Agora é um seletor) */}
                    <button onClick={() => { setSelectedAction('authorial'); setSelectedContext(''); }} className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${selectedAction === 'authorial' ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                        <PenTool className="w-8 h-8 mb-1" />
                        <span className="font-bold">Post Autoral</span>
                        <span className="text-[10px] opacity-70">Novo post baseado na imagem</span>
                    </button>
                </div>

                {/* PAINÉIS DE AÇÃO */}
                {selectedAction === 'repost' && renderContextSelector('repost')}
                {selectedAction === 'comment' && renderContextSelector('comment')}
                {selectedAction === 'authorial' && renderAuthorialSection()}
            </div>

            {/* MODAL DE RESULTADO */}
            {showResultModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl flex flex-col shadow-2xl animate-slideUp">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50 rounded-t-xl">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">Texto Gerado</h3>
                            <button onClick={() => setShowResultModal(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6">
                            <textarea readOnly value={generatedText} className="w-full h-64 bg-black/30 border border-gray-600 rounded-lg p-4 text-gray-300 text-sm font-mono focus:outline-none" />
                        </div>
                        <div className="p-4 border-t border-gray-700 bg-gray-800/30 rounded-b-xl flex justify-end">
                            <button
                                onClick={() => { navigator.clipboard.writeText(generatedText); alert("Copiado!"); }}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2"
                            >
                                <Copy className="w-5 h-5" /> Copiar Texto
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
