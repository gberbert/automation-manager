import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Plus, Trash2, Linkedin as LinkedinIcon, MessageSquare, Key, Eye, EyeOff, BookOpen, CheckCircle, AlertTriangle, Cpu } from 'lucide-react';

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
        geminiModel: 'gemini-1.5-flash', // Valor padrão inicial
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
            alert('Settings saved successfully!');
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

                    {/* SELETOR DE MODELO GEMINI (NOVO) */}
                    <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-purple-400 mb-1">
                            <Cpu className="w-5 h-5" />
                            <span className="font-semibold">Google Gemini Model</span>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400">Escolha ou digite o modelo (ex: caso mude a versão):</label>
                            <input 
                                list="gemini-models" 
                                type="text"
                                value={settings.geminiModel || 'gemini-1.5-flash'}
                                onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none font-mono text-sm"
                                placeholder="Select or type model name..."
                            />
                            <datalist id="gemini-models">
                                <option value="gemini-1.5-flash" />
                                <option value="gemini-1.5-flash-001" />
                                <option value="gemini-1.5-flash-002" />
                                <option value="gemini-1.5-pro" />
                                <option value="gemini-1.5-pro-001" />
                                <option value="gemini-2.0-flash-exp" />
                            </datalist>
                            <p className="text-xs text-gray-500">Use <strong>gemini-1.5-flash-001</strong> se tiver problemas de '404 Not Found'.</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">LinkedIn Client ID</label>
                        <input type="text" value={settings.linkedinClientId || ''} onChange={(e) => setSettings({ ...settings, linkedinClientId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" placeholder="Ex: 77j64l02pa24s" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">LinkedIn Client Secret</label>
                        <div className="relative flex items-center">
                            <input type={showSecret ? "text" : "password"} value={settings.linkedinClientSecret || ''} onChange={(e) => setSettings({ ...settings, linkedinClientSecret: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-12 text-white focus:border-blue-500 outline-none" placeholder="Ex: WPL_AP1..." />
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
                <div className="text-gray-300 text-center p-8">Consulte a aba anterior para o Setup Guide detalhado.</div>
            )}
        </div>
    );
}