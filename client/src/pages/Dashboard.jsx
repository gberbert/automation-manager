import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { BarChart3, Clock, CheckCircle, AlertCircle, Sparkles, Linkedin, Instagram } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        approved: 0,
        published: 0,
        linkedin: {
            total: 0,
            pending: 0,
            approved: 0,
            published: 0
        },
        instagram: {
            total: 0,
            pending: 0,
            approved: 0,
            published: 0
        }
    });
    const [generating, setGenerating] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        const q = collection(db, 'posts');
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => d.data());

        // Overall stats
        const total = data.length;
        const pending = data.filter(p => p.status === 'pending').length;
        const approved = data.filter(p => p.status === 'approved').length;
        const published = data.filter(p => p.status === 'published').length;

        // LinkedIn stats
        const linkedinPosts = data.filter(p => !p.platform || p.platform === 'linkedin');
        const linkedinTotal = linkedinPosts.length;
        const linkedinPending = linkedinPosts.filter(p => p.status === 'pending').length;
        const linkedinApproved = linkedinPosts.filter(p => p.status === 'approved').length;
        const linkedinPublished = linkedinPosts.filter(p => p.status === 'published').length;

        // Instagram stats
        const instagramPosts = data.filter(p => p.platform === 'instagram');
        const instagramTotal = instagramPosts.length;
        const instagramPending = instagramPosts.filter(p => p.status === 'pending').length;
        const instagramApproved = instagramPosts.filter(p => p.status === 'approved').length;
        const instagramPublished = instagramPosts.filter(p => p.status === 'published').length;

        setStats({
            total,
            pending,
            approved,
            published,
            linkedin: {
                total: linkedinTotal,
                pending: linkedinPending,
                approved: linkedinApproved,
                published: linkedinPublished
            },
            instagram: {
                total: instagramTotal,
                pending: instagramPending,
                approved: instagramApproved,
                published: instagramPublished
            }
        });
    };

    const handleGenerateNow = async () => {
        setGenerating(true);
        setMessage('');

        try {
            // Call backend to generate content
            // Use relative path so it works both locally (with proxy) and in production
            const apiUrl = import.meta.env.PROD ? '/api/generate-content' : 'http://localhost:3000/api/generate-content';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok && result.post) {
                // Save directly to Firestore from frontend
                await addDoc(collection(db, 'posts'), {
                    ...result.post,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                setMessage('✅ Post gerado com sucesso! Vá para "Approvals" para revisar.');
                fetchStats();
            } else {
                setMessage(`❌ Erro: ${result.error || 'Falha ao gerar post'}`);
            }
        } catch (error) {
            setMessage(`❌ Erro: ${error.message}`);
        } finally {
            setGenerating(false);
        }
    };

    // eslint-disable-next-line no-unused-vars
    const StatCard = ({ title, value, icon: IconComponent, color, subColor }) => (
        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 flex items-center space-x-4">
            <div className={`p-3 rounded-lg ${subColor}`}>
                <IconComponent className={`w-6 h-6 ${color}`} />
            </div>
            <div>
                <p className="text-gray-400 text-sm">{title}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
            </div>
        </div>
    );

    const PlatformCard = ({ platform, stats, icon: IconComponent, color, bgColor }) => (
        <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${bgColor}`}>
                    <IconComponent className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white">{platform}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/50 p-3 rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Total</p>
                    <p className="text-xl font-bold text-white">{stats.total}</p>
                </div>
                <div className="bg-gray-900/50 p-3 rounded-lg">
                    <p className="text-xs text-yellow-400 mb-1">Pending</p>
                    <p className="text-xl font-bold text-white">{stats.pending}</p>
                </div>
                <div className="bg-gray-900/50 p-3 rounded-lg">
                    <p className="text-xs text-purple-400 mb-1">Approved</p>
                    <p className="text-xl font-bold text-white">{stats.approved}</p>
                </div>
                <div className="bg-gray-900/50 p-3 rounded-lg">
                    <p className="text-xs text-green-400 mb-1">Published</p>
                    <p className="text-xl font-bold text-white">{stats.published}</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-3xl font-bold text-white">Dashboard</h2>
                <button
                    onClick={handleGenerateNow}
                    disabled={generating}
                    className="w-full md:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transform hover:scale-[1.02] transition-all disabled:cursor-not-allowed"
                >
                    <Sparkles className={`w-5 h-5 ${generating ? 'animate-spin' : ''}`} />
                    <span>{generating ? 'Gerando...' : 'Gerar Post Agora'}</span>
                </button>
            </div>

            {message && (
                <div className={`p-4 rounded-lg ${message.includes('✅') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {message}
                </div>
            )}

            {/* Overall Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Posts"
                    value={stats.total}
                    icon={BarChart3}
                    color="text-blue-400"
                    subColor="bg-blue-400/10"
                />
                <StatCard
                    title="Pending Approval"
                    value={stats.pending}
                    icon={AlertCircle}
                    color="text-yellow-400"
                    subColor="bg-yellow-400/10"
                />
                <StatCard
                    title="Ready to Publish"
                    value={stats.approved}
                    icon={Clock}
                    color="text-purple-400"
                    subColor="bg-purple-400/10"
                />
                <StatCard
                    title="Published"
                    value={stats.published}
                    icon={CheckCircle}
                    color="text-green-400"
                    subColor="bg-green-400/10"
                />
            </div>

            {/* Platform-specific Stats */}
            <div>
                <h3 className="text-xl font-semibold text-white mb-4">By Platform</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <PlatformCard
                        platform="LinkedIn"
                        stats={stats.linkedin}
                        icon={Linkedin}
                        color="text-blue-400"
                        bgColor="bg-blue-400/10"
                    />
                    <PlatformCard
                        platform="Instagram"
                        stats={stats.instagram}
                        icon={Instagram}
                        color="text-pink-400"
                        bgColor="bg-pink-400/10"
                    />
                </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur p-8 rounded-xl border border-gray-700 text-center">
                <h3 className="text-xl font-semibold text-white mb-2">System Status</h3>
                <p className="text-gray-400">The scheduler is running in the background. Check the "Approvals" tab for new content.</p>
            </div>
        </div>
    );
}
