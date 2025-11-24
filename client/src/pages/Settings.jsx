import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        geminiApiKey: '',
        scheduleCron: '0 9 * * *', // Default 9 AM daily
        language: 'en'
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'settings', 'global');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    // Filtra apenas o que interessa para esta página para não sobrescrever o resto
                    const data = docSnap.data();
                    setSettings(prev => ({
                        ...prev,
                        geminiApiKey: data.geminiApiKey || '',
                        scheduleCron: data.scheduleCron || '0 9 * * *',
                        language: data.language || 'en'
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
            alert('Global settings saved successfully!');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert('Failed to save settings.');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-8">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                    <h3 className="text-xl font-semibold text-purple-400">AI Configuration</h3>
                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">Gemini API Key</label>
                        <input
                            type="password"
                            value={settings.geminiApiKey || ''}
                            onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none"
                            placeholder="AIzaSy..."
                        />
                        <p className="text-xs text-gray-500">Required for content generation.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">Language</label>
                        <select
                            value={settings.language || 'en'}
                            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none"
                        >
                            <option value="en">English</option>
                            <option value="pt-BR">Portuguese (Brazil)</option>
                        </select>
                    </div>
                </div>

                <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                    <h3 className="text-xl font-semibold text-purple-400">Scheduler</h3>
                    <div className="space-y-2">
                        <label className="text-sm text-gray-400">Cron Expression</label>
                        <input
                            type="text"
                            value={settings.scheduleCron || ''}
                            onChange={(e) => setSettings({ ...settings, scheduleCron: e.target.value })}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none font-mono"
                            placeholder="0 9 * * *"
                        />
                        <p className="text-xs text-gray-500">Default: 0 9 * * * (Every day at 9 AM)</p>
                    </div>
                </div>
            </div>
        </div>
    );
}