import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Plus, Trash2, Linkedin as LinkedinIcon, MessageSquare, Key, Eye, EyeOff, BookOpen, Cpu, Image as ImageIcon, Layers, Loader2, FileText, Target, X, Edit2, Check, Calendar, MessageCircle, Share2, PenTool } from 'lucide-react';
import LinkedinGuide from '../components/LinkedinGuide';
import { GEMINI_MODELS, IMAGE_PROVIDERS } from '../constants';

export default function Linkedin() {
    const [activeTab, setActiveTab] = useState('connection');
    // Abas principais dentro de Prompts: 'posts' | 'reactions'
    const [promptCategory, setPromptCategory] = useState('posts');
    // Sub-abas de Posts: 'image' | 'pdf'
    const [postStrategyTab, setPostStrategyTab] = useState('image');
    // Sub-abas de Reactions: 'repost' | 'comment'
    const [reactionStrategyTab, setReactionStrategyTab] = useState('repost');

    const [loading, setLoading] = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [showSecret, setShowSecret] = useState(false);

    // Modal de Leitura/Edição
    const [viewingItem, setViewingItem] = useState(null);
    const [isEditingModal, setIsEditingModal] = useState(false);
    const [modalValue, setModalValue] = useState('');

    const [settings, setSettings] = useState({
        linkedinClientId: '', linkedinClientSecret: '', linkedinRedirectUri: '', linkedinAccessToken: '', linkedinUrn: '',
        geminiModel: 'gemini-2.5-flash', imageProvider: 'imagen',
        // Posts Originais
        strategyImage: { template: '', contexts: [], topics: [] },
        strategyPdf: { template: '', contexts: [], topics: [], source: 'arxiv', dateFilter: '2024' },
        // Novas Estratégias (Sem Topics Pool)
        strategyRepost: { template: 'Crie um repost engajador sobre este conteúdo.', contexts: [] },
        strategyComment: { template: 'Escreva um comentário perspicaz ou uma pergunta sobre este post.', contexts: [] },

        lastUsedStrategy: 'pdf'
    });

    const [newTopic, setNewTopic] = useState('');
    const [newContext, setNewContext] = useState('');
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "Não detectado";

    useEffect(() => {
        const fetchSettings = async () => {
            setLoadError(false);
            try {
                const docRef = doc(db, 'settings', 'global');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();

                    // Defaults para garantir que não quebre se for a primeira vez
                    const defaultImage = { template: 'Crie um post com imagem.', contexts: [], topics: [] };
                    const defaultPdf = { template: 'Crie um post sobre este artigo.', contexts: [], topics: [], source: 'arxiv', dateFilter: '2024' };
                    const defaultRepost = { template: 'Analise o link e crie um repost opinativo.', contexts: [] };
                    const defaultComment = { template: 'Crie um comentário ou pergunta instigante.', contexts: [] };

                    setSettings({
                        ...data,
                        linkedinClientId: data.linkedinClientId || '',
                        linkedinClientSecret: data.linkedinClientSecret || '',
                        linkedinRedirectUri: data.linkedinRedirectUri || '',
                        linkedinAccessToken: data.linkedinAccessToken || '',
                        linkedinUrn: data.linkedinUrn || '',
                        geminiModel: data.geminiModel || 'gemini-2.5-flash',
                        imageProvider: data.imageProvider || 'imagen',
                        strategyImage: data.strategyImage || defaultImage,
                        strategyPdf: data.strategyPdf || defaultPdf,
                        strategyRepost: data.strategyRepost || defaultRepost,
                        strategyComment: data.strategyComment || defaultComment,
                    });
                }
            } catch (error) {
                console.error("Erro crítico:", error); setLoadError(true);
            } finally { setInitialLoad(false); }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        if (loadError) return alert("Erro no carregamento.");
        setLoading(true);
        try {
            await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
            alert('Configurações salvas!');
        } catch (error) {
            alert('Falha ao salvar.');
        }
        setLoading(false);
    };

    // Helper para identificar qual objeto de settings estamos editando
    const getCurrentStrategyKey = () => {
        if (promptCategory === 'posts') {
            return postStrategyTab === 'image' ? 'strategyImage' : 'strategyPdf';
        } else {
            return reactionStrategyTab === 'repost' ? 'strategyRepost' : 'strategyComment';
        }
    };

    const updateStrategy = (field, value) => {
        const target = getCurrentStrategyKey();
        setSettings(prev => ({ ...prev, [target]: { ...prev[target], [field]: value } }));
    };

    const addList = (field, value, setFn) => {
        if (value.trim()) {
            const target = getCurrentStrategyKey();
            const currentList = settings[target][field] || [];
            updateStrategy(field, [...currentList, value.trim()]);
            setFn('');
        }
    };

    const removeList = (field, index) => {
        const target = getCurrentStrategyKey();
        const currentList = settings[target][field] || [];
        updateStrategy(field, currentList.filter((_, i) => i !== index));
    };

    const handleSaveModal = () => {
        if (!viewingItem) return;
        const target = getCurrentStrategyKey();
        const field = viewingItem.type;
        const newList = [...settings[target][field]];
        newList[viewingItem.index] = modalValue;
        updateStrategy(field, newList);
        setViewingItem(null); setIsEditingModal(false);
    };

    const openModal = (type, index, value) => {
        setViewingItem({ type, index });
        setModalValue(value); setIsEditingModal(false);
    };

    const activeConfig = settings[getCurrentStrategyKey()];
    const showTopics = promptCategory === 'posts'; // Só mostra Topics Pool na aba de Posts

    if (initialLoad) return <div className="flex justify-center h-64 items-center"><Loader2 className="w-10 h-10 text-blue-500 animate-spin" /></div>;

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-600/20 rounded-xl"><LinkedinIcon className="w-8 h-8 text-blue-500" /></div>
                    <div><h2 className="text-3xl font-bold text-white">LinkedIn Manager</h2><p className="text-xs text-gray-500 mt-1">Projeto: {projectId}</p></div>
                </div>
                <button onClick={handleSave} disabled={loading || loadError} className={`flex items-center space-x-2 text-white px-6 py-2 rounded-lg transition-all ${loadError ? 'bg-red-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}><Save className="w-4 h-4" /><span>{loading ? 'Salvando...' : 'Salvar Alterações'}</span></button>
            </div>

            <div className="flex space-x-4 border-b border-gray-700 overflow-x-auto">
                <button onClick={() => setActiveTab('connection')} className={`pb-4 px-4 font-medium transition-colors ${activeTab === 'connection' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}><div className="flex items-center gap-2"><Key className="w-4 h-4" /> Connection</div></button>
                <button onClick={() => setActiveTab('prompts')} className={`pb-4 px-4 font-medium transition-colors ${activeTab === 'prompts' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}><div className="flex items-center gap-2"><Layers className="w-4 h-4" /> Prompts</div></button>
                <button onClick={() => setActiveTab('guide')} className={`pb-4 px-4 font-medium transition-colors ${activeTab === 'guide' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}><div className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Setup Guide</div></button>
            </div>

            {/* MODAL EDIÇÃO */}
            {viewingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50 rounded-t-xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Target className="w-5 h-5 text-yellow-400" /> Editando Item #{viewingItem.index + 1}</h3>
                            <button onClick={() => setViewingItem(null)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-gray-900 flex-1">
                            {isEditingModal ? <textarea className="w-full h-64 bg-gray-800 text-white p-4 rounded-lg border border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none" value={modalValue} onChange={(e) => setModalValue(e.target.value)} /> : <p className="text-gray-300 whitespace-pre-wrap font-mono text-sm leading-relaxed p-4 bg-gray-800/30 rounded-lg border border-gray-700">{modalValue}</p>}
                        </div>
                        <div className="p-4 border-t border-gray-700 bg-gray-800/30 rounded-b-xl flex justify-end gap-3">
                            {!isEditingModal ? <><button onClick={() => setIsEditingModal(true)} className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-4 py-2 rounded-lg border border-blue-500/30"><Edit2 className="w-4 h-4" /> EDITAR</button><button onClick={() => setViewingItem(null)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">Fechar</button></> : <><button onClick={() => setIsEditingModal(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">Cancelar</button><button onClick={handleSaveModal} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg"><Check className="w-4 h-4" /> SALVAR</button></>}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'connection' && (
                <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6 animate-fadeIn">
                    <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg space-y-3"><div className="flex items-center gap-2 text-purple-400 mb-1"><Cpu className="w-5 h-5" /><span className="font-semibold">Google Gemini Model (Text)</span></div><input list="gemini-models" type="text" value={settings.geminiModel} onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none font-mono text-sm" /><datalist id="gemini-models">{GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</datalist></div>
                    <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-lg space-y-3"><div className="flex items-center gap-2 text-green-400"><ImageIcon className="w-5 h-5" /><span className="font-semibold">Image Strategy (Prioridade)</span></div><select value={settings.imageProvider} onChange={(e) => setSettings({ ...settings, imageProvider: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 outline-none">{IMAGE_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                    <div className="space-y-2"><label className="text-sm text-gray-400">Client ID</label><input type="text" value={settings.linkedinClientId} onChange={(e) => setSettings({ ...settings, linkedinClientId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" /></div>
                    <div className="space-y-2"><label className="text-sm text-gray-400">Client Secret</label><div className="relative flex items-center"><input type={showSecret ? "text" : "password"} value={settings.linkedinClientSecret} onChange={(e) => setSettings({ ...settings, linkedinClientSecret: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-12 text-white focus:border-blue-500 outline-none" /><button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 p-1 text-gray-400 hover:text-white z-10 cursor-pointer">{showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                    <div className="space-y-2"><label className="text-sm text-gray-400">Redirect URI</label><div className="flex gap-2"><input type="text" value={settings.linkedinRedirectUri} onChange={(e) => setSettings({ ...settings, linkedinRedirectUri: e.target.value })} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" /><button onClick={() => { const origin = window.location.origin; setSettings({ ...settings, linkedinRedirectUri: `${origin}/auth/linkedin/callback` }); }} className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded-lg text-xs">Auto-fill</button></div></div>
                    <div className="pt-4 border-t border-gray-700"><button onClick={() => { const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${settings.linkedinClientId}&redirect_uri=${encodeURIComponent(settings.linkedinRedirectUri)}&scope=openid%20profile%20email%20w_member_social`; window.open(authUrl, 'LinkedIn OAuth', 'width=600,height=700'); }} className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold transition-colors"><LinkedinIcon className="w-5 h-5" /><span>Connect LinkedIn Account</span></button><p className="text-xs text-gray-500 mt-2 text-center">{settings.linkedinAccessToken ? '✅ Token Saved & Active' : 'Click to get Access Token'}</p></div>
                    <div className="space-y-2"><label className="text-sm text-gray-400">LinkedIn URN (Manual)</label><input type="text" value={settings.linkedinUrn} onChange={(e) => setSettings({ ...settings, linkedinUrn: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" placeholder="urn:li:person:..." /></div>
                </div>
            )}

            {activeTab === 'prompts' && (
                <div className="space-y-6 animate-fadeIn">

                    {/* NÍVEL 1: CATEGORIA DO PROMPT */}
                    <div className="flex gap-4 border-b border-gray-700 pb-2">
                        <button onClick={() => setPromptCategory('posts')} className={`text-lg font-bold pb-2 transition-colors ${promptCategory === 'posts' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Posts (Conteúdo Original)</button>
                        <button onClick={() => setPromptCategory('reactions')} className={`text-lg font-bold pb-2 transition-colors ${promptCategory === 'reactions' ? 'text-white border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>Re-posts & Respostas</button>
                    </div>

                    {/* NÍVEL 2: SUB-ABAS DE ACORDO COM A CATEGORIA */}
                    <div className="flex bg-gray-800 p-1 rounded-lg">
                        {promptCategory === 'posts' ? (
                            <>
                                <button onClick={() => setPostStrategyTab('image')} className={`flex-1 py-2 px-4 rounded flex gap-2 justify-center items-center text-sm font-medium transition-all ${postStrategyTab === 'image' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                                    <ImageIcon className="w-4 h-4" /> Texto + Imagem
                                </button>
                                <button onClick={() => setPostStrategyTab('pdf')} className={`flex-1 py-2 px-4 rounded flex gap-2 justify-center items-center text-sm font-medium transition-all ${postStrategyTab === 'pdf' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                                    <FileText className="w-4 h-4" /> Texto + PDF (Curadoria)
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setReactionStrategyTab('repost')} className={`flex-1 py-2 px-4 rounded flex gap-2 justify-center items-center text-sm font-medium transition-all ${reactionStrategyTab === 'repost' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                                    <Share2 className="w-4 h-4" /> Re-post (Share)
                                </button>
                                <button onClick={() => setReactionStrategyTab('comment')} className={`flex-1 py-2 px-4 rounded flex gap-2 justify-center items-center text-sm font-medium transition-all ${reactionStrategyTab === 'comment' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                                    <MessageCircle className="w-4 h-4" /> Comment / Question
                                </button>
                            </>
                        )}
                    </div>

                    {/* CONTEÚDO ESPECÍFICO (PDF Filters) */}
                    {promptCategory === 'posts' && postStrategyTab === 'pdf' && (
                        <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-xl flex flex-wrap items-center gap-4">
                            <FileText className="w-6 h-6 text-red-400" />
                            <div className="flex-1">
                                <h3 className="text-red-400 font-bold">Curadoria Científica (Multi-Portal)</h3>
                                <p className="text-xs text-gray-400">Busca automática em: ArXiv, Semantic Scholar, PubMed, ERIC e PapersWithCode.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-red-300 flex items-center gap-1"><Calendar className="w-3 h-3" /> Ano Mín:</label>
                                <input type="number" min="2020" max="2030" value={settings.strategyPdf?.dateFilter || '2024'} onChange={(e) => updateStrategy('dateFilter', e.target.value)} className="bg-gray-900 text-white px-3 py-1 rounded border border-gray-600 text-sm w-20 text-center" />
                            </div>
                        </div>
                    )}

                    {/* ÁREA DE EDIÇÃO (PROMPT E CONTEXTO) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* 1. PROMPT BASE */}
                        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2 text-white">
                                <MessageSquare className="w-5 h-5" /> Prompt Base
                            </h3>
                            <textarea rows={12} value={activeConfig?.template || ''} onChange={(e) => updateStrategy('template', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none font-mono text-sm" placeholder="Digite o prompt base aqui..." />
                        </div>

                        <div className="flex flex-col gap-6">

                            {/* 2. CONTEXTS POOL */}
                            <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4 flex-1">
                                <h3 className="text-xl font-semibold text-yellow-400 flex items-center gap-2"><Target className="w-5 h-5" /> Contexts Pool (Perfis)</h3>
                                <div className="flex gap-2"><textarea rows={2} value={newContext} onChange={(e) => setNewContext(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-yellow-500 outline-none" placeholder="Novo contexto/persona..." /><button onClick={() => addList('contexts', newContext, setNewContext)} className="bg-yellow-600 px-3 rounded text-white flex items-center"><Plus className="w-4 h-4" /></button></div>
                                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                                    {(activeConfig?.contexts || []).map((ctx, index) => {
                                        const displayVal = typeof ctx === 'object' ? (ctx.text || JSON.stringify(ctx)) : ctx;
                                        return (
                                            <div key={index} className="flex justify-between bg-yellow-900/20 p-2 rounded border border-yellow-800/50">
                                                <p className="text-xs text-yellow-100 truncate w-40"><span className="font-bold mr-2 text-yellow-500">#{index + 1}</span>{displayVal}</p>
                                                <div className="flex gap-1"><button onClick={() => openModal('contexts', index, displayVal)} className="text-blue-400 hover:text-blue-300"><Eye className="w-3 h-3" /></button><button onClick={() => removeList('contexts', index)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3. TOPICS POOL (APENAS PARA POSTS) */}
                            {showTopics && (
                                <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4 flex-1">
                                    <h3 className="text-xl font-semibold text-blue-400 flex items-center gap-2"><Layers className="w-5 h-5" /> Topics Pool</h3>
                                    <div className="flex gap-2"><input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addList('topics', newTopic, setNewTopic)} className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm" placeholder="Novo tópico..." /><button onClick={() => addList('topics', newTopic, setNewTopic)} className="bg-blue-600 px-3 rounded text-white"><Plus className="w-4 h-4" /></button></div>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                        {(activeConfig?.topics || []).map((topic, index) => (
                                            <div key={index} className="flex items-center gap-1 px-2 py-1 rounded border text-xs bg-blue-900/30 border-blue-800 text-blue-200">
                                                <span className="font-bold text-white mr-1">#{index + 1}</span><span className="truncate max-w-[150px]">{topic}</span>
                                                <button onClick={() => openModal('topics', index, topic)} className="text-blue-300 ml-1"><Eye className="w-3 h-3" /></button><button onClick={() => removeList('topics', index)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'guide' && <LinkedinGuide />}
        </div>
    );
}