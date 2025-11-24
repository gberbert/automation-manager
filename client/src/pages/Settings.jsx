import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Settings as SettingsIcon, Calendar, Clock, Power, Linkedin as LinkedinIcon, Instagram as InstagramIcon } from 'lucide-react';

export default function Settings() {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('scheduler'); // Começa na aba nova

    // Estado inicial robusto para evitar erros de undefined
    const [settings, setSettings] = useState({
        // Chaves de API e Gerais
        geminiApiKey: '',
        firebaseStorageBucket: '',
        language: 'en',
        
        // Cloudinary
        cloudinaryCloudName: '',
        cloudinaryApiKey: '',
        cloudinaryApiSecret: '',

        // --- NOVO AGENDADOR ---
        scheduler: {
            publishing: {
                enabled: false, // Chave Mestra de Publicação
                times: ["09:00", "14:00", "18:00"] // 3 Slots Padrão
            },
            creation: {
                enabled: false, // Chave Mestra de Criação
                linkedin: {
                    enabled: false,
                    time: "08:00",
                    count: 1
                },
                instagram: {
                    enabled: false,
                    time: "08:30",
                    count: 1
                }
            }
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'settings', 'global');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // Merge profundo manual para garantir que objetos aninhados existam
                    setSettings(prev => ({
                        ...prev,
                        ...data,
                        scheduler: {
                            publishing: {
                                enabled: data.scheduler?.publishing?.enabled ?? false,
                                times: data.scheduler?.publishing?.times || ["09:00", "14:00", "18:00"]
                            },
                            creation: {
                                enabled: data.scheduler?.creation?.enabled ?? false,
                                linkedin: {
                                    enabled: data.scheduler?.creation?.linkedin?.enabled ?? false,
                                    time: data.scheduler?.creation?.linkedin?.time || "08:00",
                                    count: data.scheduler?.creation?.linkedin?.count || 1
                                },
                                instagram: {
                                    enabled: data.scheduler?.creation?.instagram?.enabled ?? false,
                                    time: data.scheduler?.creation?.instagram?.time || "08:30",
                                    count: data.scheduler?.creation?.instagram?.count || 1
                                }
                            }
                        }
                    }));
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

    // Helper para atualizar tempos de publicação
    const updatePublishTime = (index, newTime) => {
        const newTimes = [...settings.scheduler.publishing.times];
        newTimes[index] = newTime;
        setSettings(prev => ({
            ...prev,
            scheduler: {
                ...prev.scheduler,
                publishing: { ...prev.scheduler.publishing, times: newTimes }
            }
        }));
    };

    // Helper genérico para atualizar objetos aninhados
    const updateNested = (path, value) => {
        const keys = path.split('.');
        setSettings(prev => {
            const newState = { ...prev };
            let current = newState;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newState;
        });
    };

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gray-700/50 rounded-xl">
                        <SettingsIcon className="w-8 h-8 text-gray-300" />
                    </div>
                    <h2 className="text-3xl font-bold text-white">Global Settings</h2>
                </div>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full md:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-all disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    <span>{loading ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            {/* Tabs Navigation */}
            <div className="flex space-x-4 border-b border-gray-700 overflow-x-auto">
                <button onClick={() => setActiveTab('scheduler')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'scheduler' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Automation & Scheduler</div>
                    {activeTab === 'scheduler' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('general')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'general' ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><SettingsIcon className="w-4 h-4" /> General & Keys</div>
                    {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400 rounded-t-full" />}
                </button>
            </div>

            {/* --- ABA SCHEDULER (NOVA) --- */}
            {activeTab === 'scheduler' && (
                <div className="space-y-8 animate-fadeIn">
                    
                    {/* 1. PUBLICAÇÃO AUTOMÁTICA */}
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-green-400 flex items-center gap-2">
                                    <Clock className="w-5 h-5" /> Agendador de Publicação
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">Publica automaticamente posts da lista 'Approved' nestes horários.</p>
                            </div>
                            
                            {/* Toggle Mestre de Publicação */}
                            <button
                                onClick={() => updateNested('scheduler.publishing.enabled', !settings.scheduler.publishing.enabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.publishing.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.publishing.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${!settings.scheduler.publishing.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                    <label className="text-sm text-gray-400 mb-2 block">Opção {i + 1}</label>
                                    <input
                                        type="time"
                                        value={settings.scheduler.publishing.times[i]}
                                        onChange={(e) => updatePublishTime(i, e.target.value)}
                                        className="w-full bg-gray-800 text-white text-2xl font-mono p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. CRIAÇÃO AUTOMÁTICA (GERAÇÃO) */}
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                                    <Calendar className="w-5 h-5" /> Agendador de Criação (IA)
                                </h3>
                                <p className="text-xs text-gray-400 mt-1">Gera novos posts (rascunhos) automaticamente usando seus tópicos.</p>
                            </div>
                            
                            {/* Toggle Mestre de Criação */}
                            <button
                                onClick={() => updateNested('scheduler.creation.enabled', !settings.scheduler.creation.enabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.creation.enabled ? 'bg-blue-500' : 'bg-gray-600'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className={`space-y-6 ${!settings.scheduler.creation.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            
                            {/* LinkedIn Creation Config */}
                            <div className="flex items-center gap-4 bg-gray-900/30 p-4 rounded-lg border border-gray-700/50">
                                <div className="p-2 bg-blue-600/20 rounded-lg">
                                    <LinkedinIcon className="w-6 h-6 text-blue-500" />
                                </div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Horário de Criação</label>
                                        <input 
                                            type="time" 
                                            value={settings.scheduler.creation.linkedin.time}
                                            onChange={(e) => updateNested('scheduler.creation.linkedin.time', e.target.value)}
                                            className="bg-gray-800 text-white px-3 py-2 rounded w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Qtd. Posts</label>
                                        <input 
                                            type="number" min="1" max="5"
                                            value={settings.scheduler.creation.linkedin.count}
                                            onChange={(e) => updateNested('scheduler.creation.linkedin.count', parseInt(e.target.value))}
                                            className="bg-gray-800 text-white px-3 py-2 rounded w-full"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded">
                                        <span className="text-sm text-gray-300">Ativar</span>
                                        <button
                                            onClick={() => updateNested('scheduler.creation.linkedin.enabled', !settings.scheduler.creation.linkedin.enabled)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.scheduler.creation.linkedin.enabled ? 'bg-blue-500' : 'bg-gray-600'}`}
                                        >
                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.linkedin.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Instagram Creation Config */}
                            <div className="flex items-center gap-4 bg-gray-900/30 p-4 rounded-lg border border-gray-700/50">
                                <div className="p-2 bg-pink-600/20 rounded-lg">
                                    <InstagramIcon className="w-6 h-6 text-pink-500" />
                                </div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Horário de Criação</label>
                                        <input 
                                            type="time" 
                                            value={settings.scheduler.creation.instagram.time}
                                            onChange={(e) => updateNested('scheduler.creation.instagram.time', e.target.value)}
                                            className="bg-gray-800 text-white px-3 py-2 rounded w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 block mb-1">Qtd. Posts</label>
                                        <input 
                                            type="number" min="1" max="5"
                                            value={settings.scheduler.creation.instagram.count}
                                            onChange={(e) => updateNested('scheduler.creation.instagram.count', parseInt(e.target.value))}
                                            className="bg-gray-800 text-white px-3 py-2 rounded w-full"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded">
                                        <span className="text-sm text-gray-300">Ativar</span>
                                        <button
                                            onClick={() => updateNested('scheduler.creation.instagram.enabled', !settings.scheduler.creation.instagram.enabled)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.scheduler.creation.instagram.enabled ? 'bg-pink-500' : 'bg-gray-600'}`}
                                        >
                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.instagram.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* --- ABA GENERAL (ANTIGA, COM CAMPOS TÉCNICOS) --- */}
            {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-purple-400">AI & Keys</h3>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Gemini API Key</label>
                            <input type="password" value={settings.geminiApiKey} onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Language</label>
                            <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none">
                                <option value="en">English</option>
                                <option value="pt-BR">Portuguese (Brazil)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Firebase Storage Bucket</label>
                            <input type="text" value={settings.firebaseStorageBucket} onChange={(e) => setSettings({ ...settings, firebaseStorageBucket: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none" placeholder="ex: my-app.firebasestorage.app" />
                        </div>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-orange-400">Cloudinary</h3>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Cloud Name</label>
                            <input type="text" value={settings.cloudinaryCloudName} onChange={(e) => setSettings({ ...settings, cloudinaryCloudName: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">API Key</label>
                            <input type="text" value={settings.cloudinaryApiKey} onChange={(e) => setSettings({ ...settings, cloudinaryApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">API Secret</label>
                            <input type="password" value={settings.cloudinaryApiSecret} onChange={(e) => setSettings({ ...settings, cloudinaryApiSecret: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}