import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Settings as SettingsIcon, Calendar, Clock, Linkedin as LinkedinIcon, Instagram as InstagramIcon, FileText, RefreshCw, BookOpen, AlertTriangle, Globe, CheckCircle, Copy, PlayCircle, Bug, Terminal, Key, Image as ImageIcon, Camera, Eye, EyeOff, Database, Sparkles } from 'lucide-react';
import LinkedinGuide from '../components/LinkedinGuide';

export default function Settings() {
    const [loading, setLoading] = useState(false);
    const [testingCron, setTestingCron] = useState(false);
    const [activeTab, setActiveTab] = useState('scheduler');
    const [logs, setLogs] = useState([]);
    const [showKeys, setShowKeys] = useState({});

    const [settings, setSettings] = useState({
        // AI & Core Keys
        geminiApiKey: '',
        openaiApiKey: '',
        firebaseStorageBucket: '',
        language: 'en',

        // Supabase
        supabaseUrl: '',
        supabaseKey: '',

        // Cloudinary
        cloudinaryCloudName: '',
        cloudinaryApiKey: '',
        cloudinaryApiSecret: '',

        // Image Keys
        unsplashAccessKey: '',

        // Configuração
        debugMode: false,
        vercelDebugMode: false,

        // Agendador
        scheduler: {
            publishing: {
                enabled: false,
                slots: [
                    { id: 1, time: "09:00", count: 1, enabled: true },
                    { id: 2, time: "14:00", count: 1, enabled: true },
                    { id: 3, time: "18:00", count: 1, enabled: true }
                ]
            },
            creation: {
                enabled: false,
                linkedin_image: { enabled: false, time: "08:00", count: 1 },
                linkedin_pdf: { enabled: false, time: "10:00", count: 1 },
                instagram: { enabled: false, time: "08:30", count: 1 }
            }
        }
    });

    useEffect(() => {
        fetchSettings();
        if (activeTab === 'logs') fetchLogs();
    }, [activeTab]);

    const fetchSettings = async () => {
        try {
            const docRef = doc(db, 'settings', 'global');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();

                let loadedSlots = data.scheduler?.publishing?.slots;
                if (!loadedSlots || !Array.isArray(loadedSlots)) {
                    const oldTimes = data.scheduler?.publishing?.times || ["09:00", "14:00", "18:00"];
                    loadedSlots = oldTimes.map((t, i) => ({ id: i + 1, time: t, count: 1, enabled: true }));
                }

                setSettings(prev => ({
                    ...prev,
                    ...data,
                    // Carrega apenas chaves e scheduler, ignora strategies aqui
                    openaiApiKey: data.openaiApiKey || '',
                    supabaseUrl: data.supabaseUrl || '',
                    supabaseKey: data.supabaseKey || '',
                    unsplashAccessKey: data.unsplashAccessKey || '',
                    debugMode: data.debugMode ?? false,
                    vercelDebugMode: data.vercelDebugMode ?? false,
                    scheduler: {
                        publishing: {
                            enabled: data.scheduler?.publishing?.enabled ?? false,
                            slots: loadedSlots
                        },
                        creation: {
                            enabled: data.scheduler?.creation?.enabled ?? false,
                            linkedin_image: {
                                enabled: data.scheduler?.creation?.linkedin_image?.enabled ?? false,
                                time: data.scheduler?.creation?.linkedin_image?.time || "08:00",
                                count: data.scheduler?.creation?.linkedin_image?.count || 1
                            },
                            linkedin_pdf: {
                                enabled: data.scheduler?.creation?.linkedin_pdf?.enabled ?? false,
                                time: data.scheduler?.creation?.linkedin_pdf?.time || "10:00",
                                count: data.scheduler?.creation?.linkedin_pdf?.count || 1
                            },
                            instagram: {
                                enabled: data.scheduler?.creation?.instagram?.enabled ?? false,
                                time: data.scheduler?.creation?.instagram?.time || "08:30",
                                count: data.scheduler?.creation?.instagram?.count || 1
                            }
                        },
                        engagement: {
                            enabled: data.scheduler?.engagement?.enabled ?? false,
                            time: data.scheduler?.engagement?.time || "11:00",
                            monitorCount: data.scheduler?.engagement?.monitorCount || 20
                        }
                    }
                }));
            }
        } catch (error) { console.error("Error fetching settings:", error); }
    };

    const fetchLogs = async () => {
        try {
            const q = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) { console.error("Error fetching logs:", error); }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
            alert('Global Settings saved successfully!');
        } catch (error) { alert('Failed to save.'); }
        setLoading(false);
    };

    const handleTestCron = async () => {
        setTestingCron(true);
        try {
            const getApiUrl = (endpoint) => {
                const host = window.location.hostname;
                if (host === 'localhost' || host === '127.0.0.1') return `http://localhost:3000/api/${endpoint}`;
                return `/api/${endpoint}`;
            };
            await fetch(getApiUrl('cron'));
            alert('Agendador disparado! Verifique os logs.');
            setTimeout(fetchLogs, 2000);
        } catch (error) {
            alert('Erro ao disparar: ' + error.message);
        }
        setTestingCron(false);
    };

    const updateSlot = (index, field, value) => {
        const newSlots = settings.scheduler.publishing.slots.map(s => ({ ...s }));
        newSlots[index] = { ...newSlots[index], [field]: value };
        setSettings(prev => ({ ...prev, scheduler: { ...prev.scheduler, publishing: { ...prev.scheduler.publishing, slots: newSlots } } }));
    };

    const updateNested = (path, value) => {
        setSettings(prev => {
            const newState = structuredClone(prev);
            const keys = path.split('.');
            let current = newState;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newState;
        });
    };

    const toggleKey = (key) => {
        setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gray-700/50 rounded-xl"><SettingsIcon className="w-8 h-8 text-gray-300" /></div>
                    <h2 className="text-3xl font-bold text-white">Global Settings</h2>
                </div>
                <button onClick={handleSave} disabled={loading} className="w-full md:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" /><span>{loading ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            <div className="flex space-x-4 border-b border-gray-700 overflow-x-auto">
                <button onClick={() => setActiveTab('scheduler')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'scheduler' ? 'text-yellow-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Automation</div>
                    {activeTab === 'scheduler' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('general')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'general' ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><SettingsIcon className="w-4 h-4" /> General & Keys</div>
                    {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('logs')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'logs' ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><FileText className="w-4 h-4" /> System Logs</div>
                    {activeTab === 'logs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400 rounded-t-full" />}
                </button>
                <button onClick={() => setActiveTab('guide')} className={`pb-4 px-4 font-medium transition-colors relative whitespace-nowrap ${activeTab === 'guide' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>
                    <div className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Setup Guide</div>
                    {activeTab === 'guide' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                </button>
            </div>

            {/* --- ABA SCHEDULER --- */}
            {activeTab === 'scheduler' && (
                <div className="space-y-8 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                        <div><h4 className="text-white font-semibold">Teste de Diagnóstico</h4><p className="text-xs text-gray-400">Force o agendador a rodar agora.</p></div>
                        <button onClick={handleTestCron} disabled={testingCron} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg border border-gray-600 transition-colors">
                            <PlayCircle className={`w-4 h-4 ${testingCron ? 'animate-spin' : ''}`} />{testingCron ? 'Rodando...' : 'Testar Agora'}
                        </button>
                    </div>

                    {/* Publishing Scheduler */}
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div><h3 className="text-xl font-bold text-green-400 flex items-center gap-2"><Clock className="w-5 h-5" /> Agendador de Publicação</h3></div>
                            <button onClick={() => updateNested('scheduler.publishing.enabled', !settings.scheduler.publishing.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.publishing.enabled ? 'bg-green-500' : 'bg-gray-600'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.publishing.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                        </div>
                        <div className={`grid grid-cols-1 gap-4 ${!settings.scheduler.publishing.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            {settings.scheduler.publishing.slots.map((slot, index) => (
                                <div key={slot.id} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row items-center gap-4">
                                    <div className="flex-1 w-full"><label className="text-xs text-gray-400 mb-1 block">Horário Slot {index + 1}</label><input type="time" value={slot.time} onChange={(e) => updateSlot(index, 'time', e.target.value)} className="w-full bg-gray-800 text-white text-lg font-mono p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500" /></div>
                                    <div className="w-full md:w-32"><label className="text-xs text-gray-400 mb-1 block">Qtd.</label><input type="number" min="1" max="10" value={slot.count} onChange={(e) => updateSlot(index, 'count', parseInt(e.target.value))} className="w-full bg-gray-800 text-white text-lg p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-center" /></div>
                                    <div className="flex items-center gap-2 pt-4 md:pt-0"><span className={`text-sm ${slot.enabled ? 'text-white' : 'text-gray-500'}`}>{slot.enabled ? 'ATIVO' : 'PAUSADO'}</span><button onClick={() => updateSlot(index, 'enabled', !slot.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${slot.enabled ? 'bg-green-600' : 'bg-gray-700'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${slot.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Creation Scheduler */}
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div><h3 className="text-xl font-bold text-blue-400 flex items-center gap-2"><Calendar className="w-5 h-5" /> Agendador de Criação (IA)</h3></div>
                            <button onClick={() => updateNested('scheduler.creation.enabled', !settings.scheduler.creation.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.creation.enabled ? 'bg-blue-500' : 'bg-gray-600'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                        </div>
                        <div className={`space-y-6 ${!settings.scheduler.creation.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-4 bg-blue-900/10 p-4 rounded-lg border border-blue-500/30">
                                <div className="p-2 bg-blue-600/20 rounded-lg"><ImageIcon className="w-6 h-6 text-blue-500" /></div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div><label className="text-xs text-blue-300 font-bold block mb-1">LinkedIn (Imagem + Texto)</label><input type="time" value={settings.scheduler.creation.linkedin_image.time} onChange={(e) => updateNested('scheduler.creation.linkedin_image.time', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded w-full border border-gray-700" /></div>
                                    <div><label className="text-xs text-gray-400 block mb-1">Qtd.</label><input type="number" min="1" max="5" value={settings.scheduler.creation.linkedin_image.count} onChange={(e) => updateNested('scheduler.creation.linkedin_image.count', parseInt(e.target.value))} className="bg-gray-800 text-white px-3 py-2 rounded w-full border border-gray-700" /></div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded border border-gray-700"><span className="text-sm text-gray-300">Ativar</span><button onClick={() => updateNested('scheduler.creation.linkedin_image.enabled', !settings.scheduler.creation.linkedin_image.enabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.scheduler.creation.linkedin_image.enabled ? 'bg-blue-500' : 'bg-gray-600'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.linkedin_image.enabled ? 'translate-x-5' : 'translate-x-1'}`} /></button></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-red-900/10 p-4 rounded-lg border border-red-500/30">
                                <div className="p-2 bg-red-600/20 rounded-lg"><FileText className="w-6 h-6 text-red-500" /></div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div><label className="text-xs text-red-300 font-bold block mb-1">LinkedIn (PDF + Texto + Img)</label><input type="time" value={settings.scheduler.creation.linkedin_pdf.time} onChange={(e) => updateNested('scheduler.creation.linkedin_pdf.time', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded w-full border border-gray-700" /></div>
                                    <div><label className="text-xs text-gray-400 block mb-1">Qtd.</label><input type="number" min="1" max="5" value={settings.scheduler.creation.linkedin_pdf.count} onChange={(e) => updateNested('scheduler.creation.linkedin_pdf.count', parseInt(e.target.value))} className="bg-gray-800 text-white px-3 py-2 rounded w-full border border-gray-700" /></div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded border border-gray-700"><span className="text-sm text-gray-300">Ativar</span><button onClick={() => updateNested('scheduler.creation.linkedin_pdf.enabled', !settings.scheduler.creation.linkedin_pdf.enabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.scheduler.creation.linkedin_pdf.enabled ? 'bg-red-500' : 'bg-gray-600'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.linkedin_pdf.enabled ? 'translate-x-5' : 'translate-x-1'}`} /></button></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-pink-900/10 p-4 rounded-lg border border-pink-500/30 opacity-50">
                                <div className="p-2 bg-pink-600/20 rounded-lg"><InstagramIcon className="w-6 h-6 text-pink-500" /></div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div><label className="text-xs text-pink-300 font-bold block mb-1">Instagram (Em breve)</label><input type="time" value={settings.scheduler.creation.instagram.time} disabled className="bg-gray-800 text-gray-500 px-3 py-2 rounded w-full border border-gray-700 cursor-not-allowed" /></div>
                                    <div><label className="text-xs text-gray-400 block mb-1">Qtd.</label><input type="number" value="1" disabled className="bg-gray-800 text-gray-500 px-3 py-2 rounded w-full border border-gray-700 cursor-not-allowed" /></div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded border border-gray-700"><span className="text-sm text-gray-500">Inativo</span><button disabled className={`relative inline-flex h-5 w-9 items-center rounded-full bg-gray-700 cursor-not-allowed`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white translate-x-1`} /></button></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Engagement Scheduler */}
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-yellow-400 flex items-center gap-2"><Globe className="w-5 h-5" /> Monitor de Engajamento</h3>
                                <p className="text-xs text-gray-400 mt-1">Busca automática de novos comentários nos últimos X posts.</p>
                            </div>
                            <button onClick={() => updateNested('scheduler.engagement.enabled', !settings.scheduler.engagement.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.engagement?.enabled ? 'bg-yellow-500' : 'bg-gray-600'}`}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.engagement?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!settings.scheduler.engagement?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                <label className="text-xs text-gray-400 mb-1 block">Horário da Verificação</label>
                                <input type="time" value={settings.scheduler.engagement?.time || "11:00"} onChange={(e) => updateNested('scheduler.engagement.time', e.target.value)} className="w-full bg-gray-800 text-white text-lg font-mono p-2 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500" />
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                <label className="text-xs text-gray-400 mb-1 block">Qtde de Posts Recentes a Monitorar</label>
                                <input type="number" min="5" max="50" value={settings.scheduler.engagement?.monitorCount || 20} onChange={(e) => updateNested('scheduler.engagement.monitorCount', parseInt(e.target.value))} className="w-full bg-gray-800 text-white text-lg p-2 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-purple-400">AI & Text Generation</h3>
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Gemini API Key (Texto)</label>
                            <div className="relative flex items-center">
                                <input type={showKeys.gemini ? "text" : "password"} value={settings.geminiApiKey} onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-12 text-white focus:border-purple-500 outline-none" placeholder="AIzaSy..." />
                                <button type="button" onClick={() => toggleKey('gemini')} className="absolute right-3 p-1 text-gray-400 hover:text-white z-10 cursor-pointer">
                                    {showKeys.gemini ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2"><label className="text-sm text-gray-400">Language</label><select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none"><option value="en">English</option><option value="pt-BR">Portuguese (Brazil)</option></select></div>

                        <div className="pt-4 border-t border-gray-700">
                            <h4 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4" /> OpenAI (DALL-E 3 Imagens)</h4>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">OpenAI API Key (sk-...)</label>
                                <div className="relative flex items-center">
                                    <input type={showKeys.openai ? "text" : "password"} value={settings.openaiApiKey} onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-10 text-white text-sm focus:border-green-500 outline-none" placeholder="sk-..." />
                                    <button type="button" onClick={() => toggleKey('openai')} className="absolute right-3 p-1 text-gray-400 hover:text-white z-10 cursor-pointer">
                                        {showKeys.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-blue-400">Storage & Media</h3>
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-300">Supabase (PDFs)</h4>
                            <div className="space-y-1"><label className="text-xs text-gray-400">URL</label><input type="text" value={settings.supabaseUrl} onChange={(e) => setSettings({ ...settings, supabaseUrl: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none" /></div>
                            <div className="space-y-1"><label className="text-xs text-gray-400">Key (Service Role)</label><input type="password" value={settings.supabaseKey} onChange={(e) => setSettings({ ...settings, supabaseKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none" /></div>
                        </div>
                        <div className="space-y-3 pt-4 border-t border-gray-700">
                            <h4 className="text-sm font-semibold text-orange-400">Cloudinary (Imagens)</h4>
                            <div className="space-y-1"><label className="text-xs text-gray-400">Cloud Name</label><input type="text" value={settings.cloudinaryCloudName} onChange={(e) => setSettings({ ...settings, cloudinaryCloudName: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-orange-500 outline-none" /></div>
                            <div className="space-y-1"><label className="text-xs text-gray-400">API Key</label><input type="text" value={settings.cloudinaryApiKey} onChange={(e) => setSettings({ ...settings, cloudinaryApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-orange-500 outline-none" /></div>
                            <div className="space-y-1"><label className="text-xs text-gray-400">API Secret</label><input type="password" value={settings.cloudinaryApiSecret} onChange={(e) => setSettings({ ...settings, cloudinaryApiSecret: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-12 text-white focus:border-orange-500 outline-none" /></div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-green-400">Logs</h3><button onClick={fetchLogs}><RefreshCw className="w-4 h-4" /></button></div>
                    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden"><div className="max-h-[500px] overflow-y-auto"><table className="w-full text-left border-collapse"><tbody className="text-sm divide-y divide-gray-800">{logs.map(log => (<tr key={log.id}><td className="p-4 text-gray-400 font-mono">{log.timestamp?.toDate ? new Date(log.timestamp.toDate()).toLocaleString() : 'Just now'}</td><td className="p-4 text-white">{log.message}</td></tr>))}</tbody></table></div></div>
                </div>
            )}

            {activeTab === 'guide' && <LinkedinGuide />}
        </div>
    );
}