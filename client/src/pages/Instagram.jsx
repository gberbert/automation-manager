import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Plus, Trash2, Instagram as InstagramIcon, MessageSquare, Key, HelpCircle, Cpu } from 'lucide-react';

export default function Instagram() {
    const [activeTab, setActiveTab] = useState('connection');
    const [loading, setLoading] = useState(false);

    const [settings, setSettings] = useState({
        instagramAccessToken: '',
        instagramAccountId: '',
        geminiModel: 'gemini-2.5-flash', // Padrão atualizado
        instagramPromptTemplate: 'Crie uma legenda visualmente atraente para o Instagram sobre {topic}. Inclua emojis e 30 hashtags.',
        instagramContext: '',
        instagramTopics: []
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
            alert('Instagram settings saved successfully!');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('Failed to save settings.');
        }
        setLoading(false);
    };

    const addTopic = () => {
        if (newTopic.trim()) {
            setSettings({ ...settings, instagramTopics: [...(settings.instagramTopics || []), newTopic.trim()] });
            setNewTopic('');
        }
    };

    const removeTopic = (index) => {
        const newTopics = settings.instagramTopics.filter((_, i) => i !== index);
        setSettings({ ...settings, instagramTopics: newTopics });
    };

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-pink-600/20 rounded-xl">
                        <InstagramIcon className="w-8 h-8 text-pink-500" />
                    </div>
                    <h2 className="text-3xl font-bold text-white">Instagram Manager</h2>
                </div>
                <button onClick={handleSave} disabled={loading} className="flex items-center space-x-2 bg-pink-600 hover:bg-pink-500 text-white px-6 py-2 rounded-lg transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    <span>{loading ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            <div className="flex space-x-4 border-b border-gray-700">
                <button onClick={() => setActiveTab('connection')} className={`pb-4 px-4 font-medium transition-colors relative ${activeTab === 'connection' ? 'text-pink-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><Key className="w-4 h-4" /> Connection</div>
                    {activeTab === 'connection' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pink-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('prompt')} className={`pb-4 px-4 font-medium transition-colors relative ${activeTab === 'prompt' ? 'text-pink-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Prompt & Topics</div>
                    {activeTab === 'prompt' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pink-400 rounded-t-full" />}
                </button>
            </div>

            {activeTab === 'connection' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-pink-400">API Credentials</h3>

                        {/* SELETOR DE MODELO GEMINI */}
                        <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg space-y-3">
                            <div className="flex items-center gap-2 text-purple-400 mb-1">
                                <Cpu className="w-5 h-5" />
                                <span className="font-semibold">Google Gemini Model</span>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400">Escolha ou digite o modelo:</label>
                                <input 
                                    list="gemini-models" 
                                    type="text"
                                    value={settings.geminiModel || 'gemini-2.5-flash'}
                                    onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none font-mono text-sm"
                                />
                                <datalist id="gemini-models">
                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                    <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite</option>
                                    <option value="gemini-flash-latest">Gemini Flash Latest</option>
                                </datalist>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Instagram Access Token</label>
                            <input type="password" value={settings.instagramAccessToken || ''} onChange={(e) => setSettings({ ...settings, instagramAccessToken: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-pink-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Instagram Business Account ID</label>
                            <input type="text" value={settings.instagramAccountId || ''} onChange={(e) => setSettings({ ...settings, instagramAccountId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-pink-500 outline-none" />
                        </div>
                    </div>
                </div>
            )}

            {/* Prompt Tab */}
            {activeTab === 'prompt' && (
                <div className="space-y-6 animate-fadeIn">
                    {/* Mesma estrutura de Prompt/Context/Topics do arquivo anterior... */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                            <h3 className="text-xl font-semibold text-pink-400">1. Prompt Base</h3>
                            <textarea rows={8} value={settings.instagramPromptTemplate || ''} onChange={(e) => setSettings({ ...settings, instagramPromptTemplate: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-pink-500 outline-none font-mono text-sm" />
                        </div>
                        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                            <h3 className="text-xl font-semibold text-yellow-400">2. Contexto (Opcional)</h3>
                            <textarea rows={8} value={settings.instagramContext || ''} onChange={(e) => setSettings({ ...settings, instagramContext: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-yellow-500 outline-none font-mono text-sm" />
                        </div>
                    </div>
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-green-400">3. Topics Pool</h3>
                        <div className="flex flex-col md:flex-row gap-4">
                            <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addTopic()} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-pink-500 outline-none" placeholder="Add topic..." />
                            <button onClick={addTopic} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg"><Plus className="w-5 h-5" /></button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {(settings.instagramTopics || []).map((topic, index) => (
                                <div key={index} className="flex items-center space-x-2 bg-gray-700/50 px-4 py-2 rounded-full border border-gray-600"><span className="text-gray-200">{topic}</span><button onClick={() => removeTopic(index)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button></div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}