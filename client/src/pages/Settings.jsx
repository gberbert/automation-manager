import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Settings as SettingsIcon, Calendar, Clock, Linkedin as LinkedinIcon, Instagram as InstagramIcon, FileText, RefreshCw, Trash2 } from 'lucide-react';

export default function Settings() {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('scheduler');
    const [logs, setLogs] = useState([]); // Estado para os logs

    const [settings, setSettings] = useState({
        geminiApiKey: '',
        firebaseStorageBucket: '',
        language: 'en',
        cloudinaryCloudName: '',
        cloudinaryApiKey: '',
        cloudinaryApiSecret: '',
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
                linkedin: { enabled: false, time: "08:00", count: 1 },
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
                // Merge manual para garantir integridade
                let loadedSlots = data.scheduler?.publishing?.slots;
                if (!loadedSlots || !Array.isArray(loadedSlots)) {
                    const oldTimes = data.scheduler?.publishing?.times || ["09:00", "14:00", "18:00"];
                    loadedSlots = oldTimes.map((t, i) => ({ id: i + 1, time: t, count: 1, enabled: true }));
                }
                setSettings(prev => ({
                    ...prev,
                    ...data,
                    scheduler: {
                        publishing: {
                            enabled: data.scheduler?.publishing?.enabled ?? false,
                            slots: loadedSlots
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
            alert('Settings saved successfully!');
        } catch (error) { alert('Failed to save.'); }
        setLoading(false);
    };

    const updateSlot = (index, field, value) => {
        const newSlots = [...settings.scheduler.publishing.slots];
        newSlots[index] = { ...newSlots[index], [field]: value };
        setSettings(prev => ({ ...prev, scheduler: { ...prev.scheduler, publishing: { ...prev.scheduler.publishing, slots: newSlots } } }));
    };

    const updateNested = (path, value) => {
        const keys = path.split('.');
        setSettings(prev => {
            const newState = { ...prev };
            let current = newState;
            for (let i = 0; i < keys.length - 1; i++) { current = current[keys[i]]; }
            current[keys[keys.length - 1]] = value;
            return newState;
        });
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-gray-700/50 rounded-xl"><SettingsIcon className="w-8 h-8 text-gray-300" /></div>
                    <h2 className="text-3xl font-bold text-white">Global Settings</h2>
                </div>
                <button onClick={handleSave} disabled={loading} className="w-full md:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" /><span>{loading ? 'Saving...' : 'Save Changes'}</span>
                </button>
            </div>

            {/* Tabs */}
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
            </div>

            {/* --- ABA SCHEDULER --- */}
            {activeTab === 'scheduler' && (
                <div className="space-y-8 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div><h3 className="text-xl font-bold text-green-400 flex items-center gap-2"><Clock className="w-5 h-5" /> Agendador de Publicação</h3><p className="text-xs text-gray-400 mt-1">Publica automaticamente posts 'Approved'.</p></div>
                            <button onClick={() => updateNested('scheduler.publishing.enabled', !settings.scheduler.publishing.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.publishing.enabled ? 'bg-green-500' : 'bg-gray-600'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.publishing.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                        </div>
                        <div className={`grid grid-cols-1 gap-4 ${!settings.scheduler.publishing.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            {settings.scheduler.publishing.slots.map((slot, index) => (
                                <div key={slot.id} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row items-center gap-4">
                                    <div className="flex-1 w-full"><label className="text-xs text-gray-400 mb-1 block">Horário Slot {index + 1}</label><input type="time" value={slot.time} onChange={(e) => updateSlot(index, 'time', e.target.value)} className="w-full bg-gray-800 text-white text-lg font-mono p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"/></div>
                                    <div className="w-full md:w-32"><label className="text-xs text-gray-400 mb-1 block">Qtd. Posts</label><input type="number" min="1" max="10" value={slot.count} onChange={(e) => updateSlot(index, 'count', parseInt(e.target.value))} className="w-full bg-gray-800 text-white text-lg p-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-center"/></div>
                                    <div className="flex items-center gap-2 pt-4 md:pt-0"><span className={`text-sm ${slot.enabled ? 'text-white' : 'text-gray-500'}`}>{slot.enabled ? 'ATIVO' : 'PAUSADO'}</span><button onClick={() => updateSlot(index, 'enabled', !slot.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${slot.enabled ? 'bg-green-600' : 'bg-gray-700'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${slot.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <div className="flex items-center justify-between border-b border-gray-700 pb-4">
                            <div><h3 className="text-xl font-bold text-blue-400 flex items-center gap-2"><Calendar className="w-5 h-5" /> Agendador de Criação (IA)</h3><p className="text-xs text-gray-400 mt-1">Gera rascunhos automaticamente.</p></div>
                            <button onClick={() => updateNested('scheduler.creation.enabled', !settings.scheduler.creation.enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.scheduler.creation.enabled ? 'bg-blue-500' : 'bg-gray-600'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                        </div>
                        <div className={`space-y-6 ${!settings.scheduler.creation.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-4 bg-gray-900/30 p-4 rounded-lg border border-gray-700/50">
                                <div className="p-2 bg-blue-600/20 rounded-lg"><LinkedinIcon className="w-6 h-6 text-blue-500" /></div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div><label className="text-xs text-gray-400 block mb-1">Horário</label><input type="time" value={settings.scheduler.creation.linkedin.time} onChange={(e) => updateNested('scheduler.creation.linkedin.time', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded w-full"/></div>
                                    <div><label className="text-xs text-gray-400 block mb-1">Qtd.</label><input type="number" min="1" max="5" value={settings.scheduler.creation.linkedin.count} onChange={(e) => updateNested('scheduler.creation.linkedin.count', parseInt(e.target.value))} className="bg-gray-800 text-white px-3 py-2 rounded w-full"/></div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded"><span className="text-sm text-gray-300">Ativar</span><button onClick={() => updateNested('scheduler.creation.linkedin.enabled', !settings.scheduler.creation.linkedin.enabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.scheduler.creation.linkedin.enabled ? 'bg-blue-500' : 'bg-gray-600'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.linkedin.enabled ? 'translate-x-5' : 'translate-x-1'}`} /></button></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 bg-gray-900/30 p-4 rounded-lg border border-gray-700/50">
                                <div className="p-2 bg-pink-600/20 rounded-lg"><InstagramIcon className="w-6 h-6 text-pink-500" /></div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div><label className="text-xs text-gray-400 block mb-1">Horário</label><input type="time" value={settings.scheduler.creation.instagram.time} onChange={(e) => updateNested('scheduler.creation.instagram.time', e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded w-full"/></div>
                                    <div><label className="text-xs text-gray-400 block mb-1">Qtd.</label><input type="number" min="1" max="5" value={settings.scheduler.creation.instagram.count} onChange={(e) => updateNested('scheduler.creation.instagram.count', parseInt(e.target.value))} className="bg-gray-800 text-white px-3 py-2 rounded w-full"/></div>
                                    <div className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded"><span className="text-sm text-gray-300">Ativar</span><button onClick={() => updateNested('scheduler.creation.instagram.enabled', !settings.scheduler.creation.instagram.enabled)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.scheduler.creation.instagram.enabled ? 'bg-pink-500' : 'bg-gray-600'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${settings.scheduler.creation.instagram.enabled ? 'translate-x-5' : 'translate-x-1'}`} /></button></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ABA GENERAL --- */}
            {activeTab === 'general' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-purple-400">AI & Keys</h3>
                        <div className="space-y-2"><label className="text-sm text-gray-400">Gemini API Key</label><input type="password" value={settings.geminiApiKey} onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none" /></div>
                        <div className="space-y-2"><label className="text-sm text-gray-400">Language</label><select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none"><option value="en">English</option><option value="pt-BR">Portuguese (Brazil)</option></select></div>
                        <div className="space-y-2"><label className="text-sm text-gray-400">Firebase Storage Bucket</label><input type="text" value={settings.firebaseStorageBucket} onChange={(e) => setSettings({ ...settings, firebaseStorageBucket: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none" /></div>
                    </div>
                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                        <h3 className="text-xl font-semibold text-orange-400">Cloudinary</h3>
                        <div className="space-y-2"><label className="text-sm text-gray-400">Cloud Name</label><input type="text" value={settings.cloudinaryCloudName} onChange={(e) => setSettings({ ...settings, cloudinaryCloudName: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none" /></div>
                        <div className="space-y-2"><label className="text-sm text-gray-400">API Key</label><input type="text" value={settings.cloudinaryApiKey} onChange={(e) => setSettings({ ...settings, cloudinaryApiKey: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none" /></div>
                        <div className="space-y-2"><label className="text-sm text-gray-400">API Secret</label><input type="password" value={settings.cloudinaryApiSecret} onChange={(e) => setSettings({ ...settings, cloudinaryApiSecret: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none" /></div>
                    </div>
                </div>
            )}

            {/* --- ABA LOGS (NOVA) --- */}
            {activeTab === 'logs' && (
                <div className="space-y-6 animate-fadeIn">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-green-400">System Execution Logs</h3>
                        <button onClick={fetchLogs} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white"><RefreshCw className="w-4 h-4" /> Refresh</button>
                    </div>
                    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="max-h-[500px] overflow-y-auto">
                            {logs.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">No logs found yet. Wait for the scheduler to run.</div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-800 text-gray-400 text-xs uppercase sticky top-0">
                                        <tr>
                                            <th className="p-4">Time (Server)</th>
                                            <th className="p-4">Type</th>
                                            <th className="p-4">Message</th>
                                            <th className="p-4">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm divide-y divide-gray-800">
                                        {logs.map(log => (
                                            <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                                                <td className="p-4 text-gray-400 font-mono whitespace-nowrap">
                                                    {log.timestamp?.toDate ? new Date(log.timestamp.toDate()).toLocaleString() : 'Just now'}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                        log.type === 'error' ? 'bg-red-500/20 text-red-400' :
                                                        log.type === 'success' ? 'bg-green-500/20 text-green-400' :
                                                        log.type === 'info' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-300'
                                                    }`}>
                                                        {log.type?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-white">{log.message}</td>
                                                <td className="p-4 text-gray-500 font-mono text-xs max-w-xs truncate" title={log.details}>
                                                    {log.details}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}