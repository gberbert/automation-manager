import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Plus, Trash2, Instagram as InstagramIcon, MessageSquare, Key, HelpCircle, Cpu, Image as ImageIcon } from 'lucide-react';

export default function Instagram() {
    const [activeTab, setActiveTab] = useState('connection');
    const [loading, setLoading] = useState(false);

    const [settings, setSettings] = useState({
        instagramAccessToken: '',
        instagramAccountId: '',
        geminiModel: 'gemini-2.5-flash',
        imageProvider: 'pollinations', // NOVO CAMPO
        instagramPromptTemplate: 'Crie uma legenda visualmente atraente...',
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
            alert('Settings saved!');
        } catch (error) {
            alert('Error saving settings.');
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
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-pink-600/20 rounded-xl"><InstagramIcon className="w-8 h-8 text-pink-500" /></div>
                    <h2 className="text-3xl font-bold text-white">Instagram Manager</h2>
                </div>
                <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 text-white px-6 py-2 rounded-lg">
                    <Save className="w-4 h-4" /> <span>{loading ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            <div className="flex space-x-4 border-b border-gray-700">
                <button onClick={() => setActiveTab('connection')} className={`pb-4 px-4 font-medium ${activeTab === 'connection' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400'}`}>Connection & AI</button>
                <button onClick={() => setActiveTab('prompt')} className={`pb-4 px-4 font-medium ${activeTab === 'prompt' ? 'text-pink-400 border-b-2 border-pink-400' : 'text-gray-400'}`}>Prompt & Topics</button>
            </div>

            {activeTab === 'connection' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        
                        {/* BLOCO DE TEXTO (GEMINI) */}
                        <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg space-y-3">
                            <div className="flex items-center gap-2 text-purple-400"><Cpu className="w-5 h-5" /><span className="font-semibold">Text Model (Gemini)</span></div>
                            <input list="gemini-models" type="text" value={settings.geminiModel} onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white" placeholder="gemini-2.5-flash" />
                            <datalist id="gemini-models">
                                <option value="gemini-2.5-flash" />
                                <option value="gemini-2.0-flash" />
                            </datalist>
                        </div>

						{/* SELETOR DE IMAGEM NO INSTAGRAM */}
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
									<option value="pollinations">Pollinations Standard (Rápido/Cartoon)</option>
									<option value="flux">Pollinations FLUX (Realista/Grátis)</option>
									<option value="imagen">Google Imagen 3 (Requer Cloudinary)</option>
								</select>
							</div>
						</div>

                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Instagram Access Token</label>
                            <input type="password" value={settings.instagramAccessToken} onChange={(e) => setSettings({ ...settings, instagramAccessToken: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Instagram Account ID</label>
                            <input type="text" value={settings.instagramAccountId} onChange={(e) => setSettings({ ...settings, instagramAccountId: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white" />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'prompt' && (
                <div className="space-y-6 animate-fadeIn">
                    {/* Mantido igual ao anterior, só o layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                            <h3 className="text-purple-400 font-semibold mb-2">Prompt Base</h3>
                            <textarea rows={6} value={settings.instagramPromptTemplate} onChange={(e) => setSettings({ ...settings, instagramPromptTemplate: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white" />
                        </div>
                        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                            <h3 className="text-yellow-400 font-semibold mb-2">Contexto</h3>
                            <textarea rows={6} value={settings.instagramContext} onChange={(e) => setSettings({ ...settings, instagramContext: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white" />
                        </div>
                    </div>
                    
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                        <h3 className="text-green-400 font-semibold mb-4">Topics Pool</h3>
                        <div className="flex gap-4 mb-4">
                            <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white" placeholder="Add topic..." />
                            <button onClick={addTopic} className="bg-green-600 px-6 rounded-lg text-white"><Plus /></button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(settings.instagramTopics || []).map((topic, i) => (
                                <div key={i} className="flex items-center gap-2 bg-gray-700 px-3 py-1 rounded-full text-sm text-white">
                                    {topic} <button onClick={() => removeTopic(i)}><Trash2 className="w-3 h-3 text-red-400" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}