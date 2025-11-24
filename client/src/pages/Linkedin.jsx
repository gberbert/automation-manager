import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Plus, Trash2, Linkedin as LinkedinIcon, MessageSquare, Key, Eye, EyeOff, BookOpen, CheckCircle, AlertTriangle, Cpu, Image as ImageIcon } from 'lucide-react';

export default function Linkedin() {
    const [activeTab, setActiveTab] = useState('connection');
    const [loading, setLoading] = useState(false);
    const [showSecret, setShowSecret] = useState(false);

    const [settings, setSettings] = useState({
        linkedinClientId: '',
        linkedinClientSecret: '',
        linkedinRedirectUri: '',
        linkedinAccessToken: '',
        linkedinUrn: '',
        geminiModel: 'gemini-2.5-flash',
        imageProvider: 'pollinations', // NOVO CAMPO
        promptTemplate: 'Crie um post profissional para o LinkedIn.',
        context: '',
        topics: []
    });
    const [newTopic, setNewTopic] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'settings', 'global');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSettings(prev => ({ ...prev, ...docSnap.data() }));
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
            alert('LinkedIn settings saved successfully!');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('Failed to save settings.');
        }
        setLoading(false);
    };

    const addTopic = () => {
        if (newTopic.trim()) {
            setSettings({ ...settings, topics: [...(settings.topics || []), newTopic.trim()] });
            setNewTopic('');
        }
    };

    const removeTopic = (index) => {
        const newTopics = settings.topics.filter((_, i) => i !== index);
        setSettings({ ...settings, topics: newTopics });
    };

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-600/20 rounded-xl">
                        <LinkedinIcon className="w-8 h-8 text-blue-500" />
                    </div>
                    <h2 className="text-3xl font-bold text-white">LinkedIn Manager</h2>
                </div>
                <button onClick={handleSave} disabled={loading} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    <span>{loading ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            <div className="flex space-x-4 border-b border-gray-700 overflow-x-auto">
                <button onClick={() => setActiveTab('connection')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'connection' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><Key className="w-4 h-4" /> Connection</div>
                    {activeTab === 'connection' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('prompt')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'prompt' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Prompt & Topics</div>
                    {activeTab === 'prompt' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('guide')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'guide' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Setup Guide</div>
                    {activeTab === 'guide' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-t-full" />}
                </button>
            </div>

            {activeTab === 'connection' && (
                <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6 animate-fadeIn">
                    <h3 className="text-xl font-semibold text-blue-400">API Credentials</h3>

                    {/* BLOCO DE TEXTO (GEMINI) */}
                    <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-purple-400 mb-1">
                            <Cpu className="w-5 h-5" />
                            <span className="font-semibold">Google Gemini Model</span>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">Modelo (Baseado na sua chave):</label>
                            <input 
                                list="gemini-models" 
                                type="text"
                                value={settings.geminiModel || 'gemini-2.5-flash'}
                                onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none font-mono text-sm"
                                placeholder="Selecione ou digite..."
                            />
                            <datalist id="gemini-models">
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recomendado)</option>
                                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                                <option value="gemini-flash-latest">Gemini Flash Latest</option>
                            </datalist>
                        </div>
                    </div>

                    {/* BLOCO DE IMAGEM (NOVO) */}
                    <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-green-400">
                            <ImageIcon className="w-5 h-5" />
                            <span className="font-semibold">Image Strategy</span>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">Provedor de Imagem:</label>
                            <select 
                                value={settings.imageProvider || 'pollinations'} 
                                onChange={(e) => setSettings({ ...settings, imageProvider: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                            >
                                <option value="pollinations">Pollinations Standard (Rápido)</option>
                                <option value="imagen">Pollinations FLUX (Alta Qualidade/Realista)</option>
                            </select>
                            <p className="text-xs text-gray-500">Use 'Alta Qualidade' para fotos profissionais no LinkedIn.</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">LinkedIn Client ID</label>
                        <input type="text" value={settings.linkedinClientId || ''} onChange={(e) => setSettings({ ...settings, linkedinClientId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">LinkedIn Client Secret</label>
                        <div className="relative flex items-center">
                            <input type={showSecret ? "text" : "password"} value={settings.linkedinClientSecret || ''} onChange={(e) => setSettings({ ...settings, linkedinClientSecret: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-12 text-white focus:border-blue-500 outline-none" />
                            <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 p-1 text-gray-400 hover:text-white z-10 cursor-pointer">
                                {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">Redirect URI</label>
                        <div className="flex gap-2">
                            <input type="text" value={settings.linkedinRedirectUri || ''} onChange={(e) => setSettings({ ...settings, linkedinRedirectUri: e.target.value })} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" />
                            <button onClick={() => { const origin = window.location.origin; setSettings({ ...settings, linkedinRedirectUri: `${origin}/auth/linkedin/callback` }); }} className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded-lg text-xs">Auto-fill</button>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-700">
                        <button onClick={() => { 
                            const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${settings.linkedinClientId}&redirect_uri=${encodeURIComponent(settings.linkedinRedirectUri)}&scope=openid%20profile%20email%20w_member_social`;
                            window.open(authUrl, 'LinkedIn OAuth', 'width=600,height=700');
                        }} className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-semibold transition-colors">
                            <LinkedinIcon className="w-5 h-5" />
                            <span>Connect LinkedIn Account</span>
                        </button>
                        <p className="text-xs text-gray-500 mt-2 text-center">{settings.linkedinAccessToken ? '✅ Token Saved & Active' : 'Click to get Access Token'}</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">LinkedIn URN (Manual Override)</label>
                        <input type="text" value={settings.linkedinUrn || ''} onChange={(e) => setSettings({ ...settings, linkedinUrn: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" placeholder="urn:li:person:..." />
                    </div>
                </div>
            )}

            {activeTab === 'prompt' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                            <h3 className="text-xl font-semibold text-purple-400">1. Prompt Base</h3>
                            <textarea rows={8} value={settings.promptTemplate || ''} onChange={(e) => setSettings({ ...settings, promptTemplate: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none font-mono text-sm" placeholder="Ex: Aja como um especialista..." />
                        </div>
                        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                            <h3 className="text-xl font-semibold text-yellow-400">2. Contexto (Opcional)</h3>
                            <textarea rows={8} value={settings.context || ''} onChange={(e) => setSettings({ ...settings, context: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-yellow-500 outline-none font-mono text-sm" placeholder="Ex: Foque em vendas B2B..." />
                        </div>
                    </div>
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-green-400">3. Topics Pool</h3>
                        <div className="flex flex-col md:flex-row gap-4">
                            <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addTopic()} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" placeholder="Add topic..." />
                            <button onClick={addTopic} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg"><Plus className="w-5 h-5" /></button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {(settings.topics || []).map((topic, index) => (
                                <div key={index} className="flex items-center space-x-2 bg-gray-700/50 px-4 py-2 rounded-full border border-gray-600"><span className="text-gray-200">{topic}</span><button onClick={() => removeTopic(index)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button></div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {activeTab === 'guide' && (
                <div className="space-y-6 animate-fadeIn max-w-4xl mx-auto">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-6 rounded-xl">
                        <h3 className="text-xl font-bold text-yellow-400 flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-6 h-6" />
                            Antes de Começar
                        </h3>
                        <p className="text-gray-300">
                            A integração com o LinkedIn é estrita. Siga este guia passo a passo para evitar erros comuns de permissão (403) ou token inválido (401).
                        </p>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                        <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                            <span className="bg-blue-500/20 w-8 h-8 flex items-center justify-center rounded-full text-sm">1</span>
                            Configuração do App (LinkedIn Developers)
                        </h3>
                        <ul className="space-y-3 text-gray-300 ml-4 list-disc pl-4">
                            <li>Acesse o <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer" className="text-blue-400 underline">LinkedIn Developer Portal</a>.</li>
                            <li>Crie um novo App e associe à sua Página (pessoal ou empresa).</li>
                            <li><strong>CRUCIAL:</strong> Vá na aba <strong>Products</strong> e adicione estes dois produtos:
                                <ul className="list-circle ml-6 mt-2 text-sm text-gray-400">
                                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-green-500"/> <strong>Share on LinkedIn</strong> (Para postar)</li>
                                    <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-green-500"/> <strong>Sign In with LinkedIn using OpenID Connect</strong> (Para logar)</li>
                                </ul>
                            </li>
                            <li>Vá na aba <strong>Auth</strong> e adicione a URL de Redirecionamento exata:
                                <div className="bg-black/30 p-2 rounded mt-1 font-mono text-xs text-yellow-200">
                                    {window.location.origin}/auth/linkedin/callback
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                        <h3 className="text-lg font-bold text-green-400 flex items-center gap-2">
                            <span className="bg-green-500/20 w-8 h-8 flex items-center justify-center rounded-full text-sm">2</span>
                            Conexão no Sistema
                        </h3>
                        <ul className="space-y-3 text-gray-300 ml-4 list-disc pl-4">
                            <li>Na aba <strong>Connection</strong> (aqui mesmo), cole o <strong>Client ID</strong> e <strong>Client Secret</strong>.</li>
                            <li>Clique em <strong>Save Changes</strong> antes de conectar.</li>
                            <li>Clique em <strong>Connect LinkedIn Account</strong>.</li>
                            <li>Na janela que abrir, verifique se as permissões pedem:
                                <em className="block mt-1 text-gray-400">"Criar, modificar e excluir publicações" (w_member_social)</em>
                            </li>
                        </ul>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                        <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                            <span className="bg-red-500/20 w-8 h-8 flex items-center justify-center rounded-full text-sm">3</span>
                            Solução de Problemas (Reset Total)
                        </h3>
                        <p className="text-gray-300 text-sm">Se você receber erros de "Access Denied" (403) mesmo com tudo configurado:</p>
                        <ol className="space-y-3 text-gray-300 ml-4 list-decimal pl-4 text-sm">
                            <li>Vá no LinkedIn (site principal) &gt; Configurações &gt; Privacidade dos dados &gt; Serviços permitidos.</li>
                            <li>Remova o acesso do seu aplicativo "Automation Manager".</li>
                            <li>Volte aqui, apague o campo <strong>LinkedIn URN</strong> (deixe vazio).</li>
                            <li>Clique em <strong>Connect LinkedIn Account</strong> novamente para gerar um token limpo.</li>
                        </ol>
                    </div>
                </div>
            )}
        </div>
    );
}