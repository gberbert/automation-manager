import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Share2, Link as LinkIcon, AlertTriangle, PenTool, MessageCircle, Copy, X, Loader2, Target, Wand2 } from 'lucide-react';

export default function Repost() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    
    // Dados de entrada
    const [incomingText, setIncomingText] = useState('');
    const [extractedLink, setExtractedLink] = useState('');
    
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
        setIncomingText(text);

        // Tenta extrair link do texto se a URL vier vazia ou misturada
        const combined = `${title} ${text} ${url}`;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const found = combined.match(urlRegex);
        if (found && found.length > 0) setExtractedLink(found[0]);
        else if (url && url.startsWith('http')) setExtractedLink(url);

        // 2. Carrega configurações para ter os contextos
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'settings', 'global');
                const snap = await getDoc(docRef);
                if (snap.exists()) setSettings(snap.data());
            } catch (e) { console.error("Erro ao carregar settings", e); }
        };
        fetchSettings();
    }, [searchParams]);

    // AÇÃO 1: POST AUTORAL
    const handleAuthorialPost = async () => {
        setLoadingAction('authorial');
        try {
            const getApiUrl = (ep) => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `http://localhost:3000/api/${ep}` : `/api/${ep}`;
            
            const response = await fetch(getApiUrl('generate-content'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    format: 'image',
                    manualTopic: extractedLink || incomingText 
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
                    link: extractedLink
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
                    {loadingAction === 'reaction' ? <Loader2 className="w-5 h-5 animate-spin"/> : <PenTool className="w-5 h-5"/>}
                    Gerar {type === 'repost' ? 'Re-post' : 'Comentário'}
                </button>
            </div>
        );
    };

    // Renderizador da Seção Autoral (Novo)
    const renderAuthorialSection = () => {
        return (
            <div className="space-y-4 animate-fadeIn mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <h4 className="text-white font-bold flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-blue-400" /> Criar Post Original
                </h4>
                <p className="text-sm text-gray-400">
                    O sistema usará o link/texto compartilhado como <strong>Tópico Principal</strong> e criará um post completo (Texto + Imagem + PDF se aplicável) usando suas configurações padrão.
                </p>
                <button 
                    onClick={handleAuthorialPost} 
                    disabled={loadingAction === 'authorial'}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 mt-2"
                >
                    {loadingAction === 'authorial' ? <Loader2 className="w-5 h-5 animate-spin"/> : <PenTool className="w-5 h-5"/>}
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
                    {extractedLink ? <a href={extractedLink} target="_blank" rel="noreferrer" className="text-blue-300 underline break-all text-sm flex items-center gap-2"><LinkIcon className="w-4 h-4"/>{extractedLink}</a> : <div className="text-yellow-500 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Sem link detectado</div>}
                    <p className="text-gray-400 text-xs mt-2 line-clamp-3 italic">"{incomingText}"</p>
                </div>

                {/* SELEÇÃO DE AÇÃO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Botão 1: Re-post */}
                    <button onClick={() => { setSelectedAction('repost'); setSelectedContext(''); }} className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${selectedAction === 'repost' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                        <Share2 className="w-8 h-8 mb-1" />
                        <span className="font-bold">Criar Re-post</span>
                        <span className="text-[10px] opacity-70">Opinião sobre o link</span>
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
                        <span className="text-[10px] opacity-70">Novo post baseado no link</span>
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
                            <button onClick={() => setShowResultModal(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6"/></button>
                        </div>
                        <div className="p-6">
                            <textarea readOnly value={generatedText} className="w-full h-64 bg-black/30 border border-gray-600 rounded-lg p-4 text-gray-300 text-sm font-mono focus:outline-none" />
                        </div>
                        <div className="p-4 border-t border-gray-700 bg-gray-800/30 rounded-b-xl flex justify-end">
                            <button 
                                onClick={() => { navigator.clipboard.writeText(generatedText); alert("Copiado!"); }} 
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2"
                            >
                                <Copy className="w-5 h-5"/> Copiar Texto
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
