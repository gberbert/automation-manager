import React, { useState, useEffect } from 'react';
import { MessageCircle, RefreshCw, Send, CheckCircle, Clock, ExternalLink, Loader2, Play, AlertTriangle, MonitorPlay, Trash2 } from 'lucide-react';
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

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch(getApiUrl('sync-comments'), { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert(`Sincronização API concluída! ${data.newComments} novos comentários.`);
                fetchComments();
            } else {
                alert('Erro na sincronização API: ' + data.error);
            }
        } catch (error) {
            alert('Erro ao conectar com servidor.');
        } finally {
            setSyncing(false);
        }
    };

    const [rpaLimit, setRpaLimit] = useState(5);

    const handleRpaSync = async () => {
        setSyncing(true);
        try {
            alert('Atenção: Uma janela do navegador será aberta no servidor. Se solicitado, faça login manualmente.');
            const res = await fetch(getApiUrl('rpa/sync-comments'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: rpaLimit })
            });
            const data = await res.json();
            if (data.success) {
                if (data.processing) {
                    alert('⏳ Processamento Iniciado em Segundo Plano!\n\nO servidor está rodando o script. Pode continuar navegando. Verifique os comentários daqui a alguns minutos.');
                } else {
                    alert(`Sucesso! RPA capturou ${data.newComments} novos comentários.`);
                    fetchComments();
                }
            } else {
                alert('Erro no RPA: ' + data.error);
            }
        } catch (error) {
            alert('Erro na conexão com RPA.');
        } finally {
            setSyncing(false);
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
                    <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1 border border-gray-700 mr-2">
                        <span className="text-xs text-gray-400 ml-2">Posts:</span>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={rpaLimit}
                            onChange={(e) => setRpaLimit(parseInt(e.target.value))}
                            className="bg-gray-900 text-white w-12 text-center text-sm rounded border border-gray-600 focus:border-purple-500 outline-none p-1"
                        />
                    </div>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg transition-all disabled:opacity-50 text-xs border border-gray-600"
                        title="Tentativa via API Oficial"
                    >
                        <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                        <span>API Sync</span>
                    </button>
                    <button
                        onClick={handleRpaSync}
                        disabled={syncing}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-purple-900/20"
                        title="Abrir navegador e varrer posts (RPA)"
                    >
                        <MonitorPlay className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`} />
                        <span>Sincronizar (RPA)</span>
                    </button>
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
            </div>

            <div className="space-y-4">
                {loading && !syncing && <div className="text-center text-gray-500 py-8">Carregando...</div>}

                {!loading && filteredComments.length === 0 && (
                    <div className="text-center text-gray-500 py-12 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
                        <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Nenhum comentário encontrado neste filtro.</p>
                    </div>
                )}

                {filteredComments.map(comment => (
                    <div key={comment.id} className={`bg-gray-800/50 backdrop-blur rounded-xl border ${comment.replied ? 'border-green-500/30' : 'border-gray-700'} p-6 transition-all hover:bg-gray-800`}>
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-bold text-white text-lg">
                                        {/* Tenta extrair nome se authorUrn tiver info, senao mostra "Usuário LinkedIn" */}
                                        Usuário LinkedIn
                                    </span>
                                    <span className="text-xs text-gray-500 font-mono">
                                        {new Date(comment.createdAt).toLocaleString()}
                                    </span>
                                    {comment.replied && (
                                        <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> Respondido
                                        </span>
                                    )}
                                </div>

                                <p className="text-gray-300 text-base mb-3 leading-relaxed">"{comment.text}"</p>

                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 bg-gray-900/50 p-2 rounded w-fit">
                                    <span className="font-bold text-gray-400">Post Topic:</span>
                                    <span>{comment.postTopic || 'Unknown Topic'}</span>
                                    <a href={`https://www.linkedin.com/feed/update/${comment.objectUrn}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-400 hover:underline flex items-center gap-1">
                                        Ver Post <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
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
                                    placeholder="Escreva uma resposta cordial..."
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
                                    className="mt-2 text-blue-400 hover:text-blue-300 text-sm font-bold flex items-center gap-2"
                                >
                                    <MessageCircle className="w-4 h-4" /> Responder
                                </button>
                            )
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
