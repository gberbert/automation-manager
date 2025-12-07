import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { BarChart3, Clock, CheckCircle, AlertCircle, Sparkles, Linkedin, Instagram, FileText, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        total: 0, pending: 0, approved: 0, published: 0,
        linkedin: { total: 0, pending: 0, approved: 0, published: 0 },
        instagram: { total: 0, pending: 0, approved: 0, published: 0 }
    });
    const [generating, setGenerating] = useState(null); // 'image' | 'pdf' | null
    const [message, setMessage] = useState('');

    useEffect(() => { fetchStats(); }, []);

    const fetchStats = async () => {
        const q = collection(db, 'posts');
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => d.data());
        const total = data.length;
        const pending = data.filter(p => p.status === 'pending').length;
        const approved = data.filter(p => p.status === 'approved').length;
        const published = data.filter(p => p.status === 'published').length;
        const linkedinPosts = data.filter(p => !p.platform || p.platform === 'linkedin');

        setStats({
            total, pending, approved, published,
            linkedin: {
                total: linkedinPosts.length,
                pending: linkedinPosts.filter(p => p.status === 'pending').length,
                approved: linkedinPosts.filter(p => p.status === 'approved').length,
                published: linkedinPosts.filter(p => p.status === 'published').length
            },
            instagram: { total: 0, pending: 0, approved: 0, published: 0 }
        });
    };

    // --- FUNÇÃO CORRIGIDA PARA EVITAR ERRO DE JSON/HTML ---
    const handleGenerateNow = async (format) => {
        setGenerating(format);
        setMessage('');
        try {
            // Helper robusto para definir a URL correta (Local vs Produção)
            const getApiUrl = (endpoint) => {
                const host = window.location.hostname;
                if (host === 'localhost' || host === '127.0.0.1') {
                    return `http://localhost:3000${endpoint}`;
                }
                return endpoint;
            };

            const apiUrl = getApiUrl('/api/generate-content');

            // Envia o formato desejado no body
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ format: format })
            });

            // Verifica se a resposta é JSON antes de parsear
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                throw new Error(`O servidor retornou HTML em vez de JSON. Verifique se o backend está rodando na porta 3000. Detalhes: ${text.substring(0, 50)}...`);
            }

            const result = await response.json();

            if (response.ok && result.post) {
                await addDoc(collection(db, 'posts'), {
                    ...result.post,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
                setMessage(`✅ Post (${format === 'pdf' ? 'PDF' : 'Imagem'}) gerado com sucesso!`);
                fetchStats();
            } else {
                setMessage(`❌ Erro: ${result.error || 'Falha ao gerar'}`);
            }
        } catch (error) {
            console.error(error);
            setMessage(`❌ Erro: ${error.message}`);
        } finally {
            setGenerating(null);
        }
    };

    const StatCard = ({ title, value, icon: IconComponent, color, subColor, onClick }) => (
        <div
            onClick={onClick}
            className={`bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 flex items-center space-x-4 ${onClick ? 'cursor-pointer hover:bg-gray-800 transition-colors' : ''}`}
        >
            <div className={`p-3 rounded-lg ${subColor}`}><IconComponent className={`w-6 h-6 ${color}`} /></div>
            <div><p className="text-gray-400 text-sm">{title}</p><p className="text-2xl font-bold text-white">{value}</p></div>
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-3xl font-bold text-white">Dashboard</h2>

                {/* BOTÕES DE GERAÇÃO DUPLOS */}
                <div className="flex gap-3 w-full md:w-auto">

                    {/* BOTÃO IMAGEM */}
                    <button
                        onClick={() => handleGenerateNow('image')}
                        disabled={generating !== null}
                        className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-all"
                    >
                        {generating === 'image' ? <Sparkles className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                        <span>{generating === 'image' ? 'Gerando...' : 'Gerar Texto + Imagem'}</span>
                    </button>

                    {/* BOTÃO PDF */}
                    <button
                        onClick={() => handleGenerateNow('pdf')}
                        disabled={generating !== null}
                        className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition-all"
                    >
                        {generating === 'pdf' ? <Sparkles className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                        <span>{generating === 'pdf' ? 'Buscando...' : 'Gerar Texto + PDF'}</span>
                    </button>

                </div>
            </div>

            {message && <div className={`p-4 rounded-lg ${message.includes('✅') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{message}</div>}

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
                    onClick={() => navigate('/approvals')}
                />
                <StatCard
                    title="Ready to Publish"
                    value={stats.approved}
                    icon={Clock}
                    color="text-purple-400"
                    subColor="bg-purple-400/10"
                    onClick={() => navigate('/approved')}
                />
                <StatCard
                    title="Published"
                    value={stats.published}
                    icon={CheckCircle}
                    color="text-green-400"
                    subColor="bg-green-400/10"
                    onClick={() => navigate('/published')}
                />
            </div>

            <div className="bg-gray-800/50 backdrop-blur p-8 rounded-xl border border-gray-700 text-center">
                <h3 className="text-xl font-semibold text-white mb-2">System Status</h3>
                <p className="text-gray-400">The scheduler is running. Check "Approvals" for new content.</p>
            </div>
        </div>
    );
}