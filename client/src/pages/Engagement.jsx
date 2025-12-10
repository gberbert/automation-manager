import React, { useState, useEffect } from 'react';
import { MessageCircle, RefreshCw, Send, CheckCircle, Clock, ExternalLink, Loader2, Play, AlertTriangle, MonitorPlay, Trash2, Terminal, Shield, Download, ThumbsUp } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase'; // Import se precisar acesso direto, mas vamos usar API para consistencia

export default function Engagement() {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null); // ID do comentário sendo respondido
    const [replyText, setReplyText] = useState('');
    const [filter, setFilter] = useState('unread'); // 'all', 'unread', 'replied'

    const getApiUrl = (endpoint) => {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.1') return `http://localhost:3000/api/${endpoint}`;
        return `/api/${endpoint}`;
    };

    const fetchComments = async () => {
        setLoading(true);
        try {
            const res = await fetch(getApiUrl('comments'));
            const data = await res.json();
            if (data.success) {
                setComments(data.comments);
            }
        } catch (error) {
            console.error("Error fetching comments:", error);
        } finally {
            setLoading(false);
        }
    };




    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if (confirmDelete) {
            const timer = setTimeout(() => setConfirmDelete(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmDelete]);

    const handleClearComments = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(getApiUrl('clear-comments'), { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert(`🧹 Limpeza concluída! ${data.count} comentários removidos.`);
                setComments([]);
                setConfirmDelete(false);
            } else {
                alert('Erro: ' + data.error);
            }
        } catch (e) { alert('Erro ao conectar.'); }
        finally { setLoading(false); }
    };

    const handleReply = async (comment) => {
        if (!replyText.trim()) return;
        setLoading(true); // Bloqueia UI geral ou específico
        try {
            const res = await fetch(getApiUrl('reply-comment'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commentId: comment.id, // URN do comentário
                    postUrn: comment.objectUrn, // URN do Post
                    text: replyText
                })
            });
            const data = await res.json();
            if (data.success) {
                // Atualiza localmente
                setComments(prev => prev.map(c => c.id === comment.id ? { ...c, replied: true, read: true } : c));
                setReplyingTo(null);
                setReplyText('');
            } else {
                alert('Erro ao responder: ' + data.error);
            }
        } catch (error) {
            alert('Erro de conexão.');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkRead = async (id) => {
        try {
            await fetch(getApiUrl(`mark-read/${id}`), { method: 'POST' });
            setComments(prev => prev.map(c => c.id === id ? { ...c, read: true } : c));
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchComments();
    }, []);

    const filteredComments = comments.filter(c => {
        if (filter === 'unread') return !c.read && !c.replied;
        if (filter === 'replied') return c.replied;
        return true;
    });

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                        <MessageCircle className="w-8 h-8 text-yellow-400" />
                        Engagement Hub
                    </h2>
                    <p className="text-gray-400 text-sm">Monitore e responda comentários do LinkedIn.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    {/* Botões de Sync Removidos - Agora 100% Automático via Scheduler */}

                    <button
                        onClick={handleClearComments}
                        disabled={syncing || loading}
                        className={`flex items-center justify-center px-3 py-2 rounded-lg transition-all disabled:opacity-50 border ${confirmDelete ? 'bg-red-600 text-white border-red-500 font-bold' : 'bg-red-900/50 hover:bg-red-900 text-red-300 border-red-900'}`}
                        title="LIMPAR para Testes (Deleta tudo)"
                    >
                        {confirmDelete ? <span className="text-xs">CONFIRMAR?</span> : <Trash2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* TAB FILTERS */}
            <div className="flex gap-4 border-b border-gray-700">
                <button
                    onClick={() => setFilter('unread')}
                    className={`pb-2 px-4 font-medium transition-colors border-b-2 ${filter === 'unread' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                    Não Lidos ({comments.filter(c => !c.read && !c.replied).length})
                </button>
                <button
                    onClick={() => setFilter('all')}
                    className={`pb-2 px-4 font-medium transition-colors border-b-2 ${filter === 'all' ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                    Todos
                </button>
                <button
                    onClick={() => setFilter('replied')}
                    className={`pb-2 px-4 font-medium transition-colors border-b-2 ${filter === 'replied' ? 'border-green-400 text-green-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                >
                    Respondidos
                </button>
                <button
                    onClick={() => setFilter('installation')}
                    className={`pb-2 px-4 font-medium transition-colors border-b-2 ${filter === 'installation' ? 'border-purple-400 text-purple-400' : 'border-transparent text-gray-400 hover:text-white'} flex items-center gap-2`}
                >
                    <Terminal className="w-4 h-4" /> Instalação
                </button>
            </div>

            {filter === 'installation' ? (
                <div className="grid gap-6 animate-fadeIn">
                    {/* 1. PRÉ-REQUISITOS */}
                    <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 p-6">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-blue-400" /> 1. Pré-Requisitos
                        </h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-300 ml-4">
                            <li>Sistema Operacional: <strong>Windows 10 ou 11</strong>.</li>
                            <li><strong>Node.js</strong> instalado.</li>
                            <li>Navegador Google Chrome instalado.</li>
                        </ul>
                    </div>

                    {/* 2. INSTALAÇÃO AUTOMÁTICA */}
                    <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 p-6">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-green-400" /> 2. Instalação Automática (Recomendado)
                        </h3>
                        <p className="text-gray-300 mb-4">
                            Criamos um script que configura tudo automaticamente para você.
                        </p>

                        <ol className="list-decimal list-inside space-y-3 text-gray-300 ml-2">
                            <li>Navegue até a pasta do projeto: <code className="bg-black/30 px-1 rounded text-yellow-400">c:\Users\K\OneDrive\Documentos\PROJETOS ANTIGRAVITY\automation-manager</code></li>
                            <li>Encontre o arquivo chamado <strong>fix_scheduler.bat</strong>.</li>
                            <li>Clique com o botão direito e selecione <strong>"Executar como Administrador"</strong> (ou apenas dê dois cliques se já tiver permissão).</li>
                            <li>O script irá remover qualquer tarefa antiga e criar a nova tarefa <strong>AntigravityRPA_Auto</strong> configurada corretamente.</li>
                        </ol>
                    </div>

                    {/* 3. COMANDOS ÚTEIS */}
                    <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 p-6">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-yellow-400" /> 3. Comandos Úteis (CMD/PowerShell)
                        </h3>

                        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 mb-4 font-mono text-sm">
                            <div className="text-gray-500 mb-2"># Forçar execução imediata (Teste):</div>
                            <div className="text-blue-400 select-all">
                                schtasks /run /tn "AntigravityRPA_Auto"
                            </div>
                        </div>

                        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 mb-4 font-mono text-sm">
                            <div className="text-gray-500 mb-2"># Verificar Status:</div>
                            <div className="text-blue-400 select-all">
                                schtasks /query /tn "AntigravityRPA_Auto" /v /fo list
                            </div>
                        </div>
                    </div>
                </div>
            ) : (

                <div className="space-y-8">
                    {loading && !syncing && <div className="text-center text-gray-500 py-8">Carregando...</div>}

                    {!loading && filteredComments.length === 0 && (
                        <div className="text-center text-gray-500 py-12 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
                            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>Nenhum comentário encontrado neste filtro.</p>
                        </div>
                    )}

                    {!loading && Object.entries(filteredComments.reduce((acc, comment) => {
                        const postKey = comment.objectUrn || 'unknown_post';
                        if (!acc[postKey]) {
                            acc[postKey] = {
                                topic: comment.postTopic || 'Post Sem Título',
                                objectUrn: comment.objectUrn,
                                comments: []
                            };
                        }
                        acc[postKey].comments.push(comment);
                        return acc;
                    }, {})).map(([postKey, group]) => (
                        <div key={postKey} className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                            {/* POST HEADER */}
                            <div className="bg-gray-900/50 p-4 border-b border-gray-700 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <ExternalLink className="w-4 h-4 text-blue-400" />
                                        {group.topic}
                                    </h3>
                                    <span className="text-xs text-gray-500 font-mono flex items-center gap-2 uppercase mt-1">
                                        ID: {postKey}
                                        <a
                                            href={`https://www.linkedin.com/feed/update/${group.objectUrn}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:underline flex items-center gap-1"
                                        >
                                            (Ver no LinkedIn)
                                        </a>
                                    </span>
                                </div>
                                <span className="bg-blue-900/30 text-blue-300 text-xs px-2 py-1 rounded-full border border-blue-800">
                                    {group.comments.length} interações
                                </span>
                            </div>

                            {/* COMMENTS LIST */}
                            <div className="p-4 space-y-4">
                                {group.comments.map(comment => (
                                    <div
                                        key={comment.id}
                                        className={`
                                            rounded-xl border p-4 transition-all hover:bg-gray-800 relative
                                            ${comment.parentId ? 'ml-8 bg-gray-800/30 border-l-4 border-l-gray-600' : 'bg-gray-800/50 backdrop-blur'}
                                            ${comment.replied ? 'border-green-500/30' : 'border-gray-700'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <div className="flex flex-col gap-1 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {comment.author?.imageUrl ? (
                                                            <img
                                                                src={comment.author.imageUrl}
                                                                alt="Avatar"
                                                                className="w-8 h-8 rounded-full border border-gray-600"
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                                                                {comment.author?.name?.charAt(0) || '?'}
                                                            </div>
                                                        )}

                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <a
                                                                    href={comment.author?.url || "#"}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="font-bold text-white text-base hover:text-blue-400 hover:underline"
                                                                >
                                                                    {comment.author?.name || "Usuário LinkedIn"}
                                                                </a>
                                                                <span className="text-xs text-gray-500 font-mono">
                                                                    {new Date(comment.createdAt).toLocaleString()}
                                                                </span>
                                                                {comment.replied && (
                                                                    <span className="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                                                        <CheckCircle className="w-3 h-3" /> Respondido
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {comment.author?.headline && (
                                                                <p className="text-xs text-gray-400 line-clamp-1">{comment.author.headline}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <p className="text-gray-300 text-sm mb-3 leading-relaxed whitespace-pre-wrap pl-10">
                                                    {comment.text}
                                                </p>

                                                {(comment.socialStats?.likes > 0 || comment.socialStats?.replies > 0) && (
                                                    <div className="flex gap-4 pl-10 mb-2">
                                                        {comment.socialStats.likes > 0 && (
                                                            <span className="text-xs text-gray-500 flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {comment.socialStats.likes} likes</span>
                                                        )}
                                                        {comment.socialStats.replies > 0 && (
                                                            <span className="text-xs text-gray-500 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {comment.socialStats.replies} replies</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {!comment.replied && (
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => handleMarkRead(comment.id)}
                                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                                                        title="Marcar como lido"
                                                    >
                                                        <CheckCircle className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* ÁREA DE RESPOSTA */}
                                        {replyingTo === comment.id ? (
                                            <div className="mt-4 bg-gray-900 p-4 rounded-lg border border-gray-700 animate-fadeIn">
                                                <label className="text-sm text-blue-400 font-bold mb-2 block">Sua Resposta:</label>
                                                <textarea
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    className="w-full bg-gray-800 border border-gray-600 rounded p-3 text-white focus:border-blue-500 outline-none min-h-[100px]"
                                                    placeholder={`Respondendo a ${comment.author?.name || 'usuário'}...`}
                                                    autoFocus
                                                />
                                                <div className="flex justify-end gap-3 mt-3">
                                                    <button
                                                        onClick={() => setReplyingTo(null)}
                                                        className="px-4 py-2 text-gray-400 hover:text-white"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => handleReply(comment)}
                                                        disabled={!replyText.trim() || loading}
                                                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                                                    >
                                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                        Enviar Resposta
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            !comment.replied && (
                                                <button
                                                    onClick={() => { setReplyingTo(comment.id); setReplyText(''); }}
                                                    className="mt-2 text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-2"
                                                >
                                                    <MessageCircle className="w-3 h-3" /> Responder
                                                </button>
                                            )
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
