import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, query, getDocs, updateDoc, doc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Check, X, Clock, Calendar, ChevronDown, ChevronUp, Linkedin, Instagram, Edit2, Save, RefreshCw, Layers, ImageOff, AlertCircle, Wand2, Upload, Camera, Search, Download, ExternalLink, FileText, AlertTriangle, Trash2 } from 'lucide-react';

export default function Approvals() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);
    const [editingPost, setEditingPost] = useState(null);
    const [editedContent, setEditedContent] = useState('');
    const [editedImageUrl, setEditedImageUrl] = useState('');
    const [regeneratingImage, setRegeneratingImage] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(null);
    const [imageLoadErrors, setImageLoadErrors] = useState({});
    const [errorMsg, setErrorMsg] = useState(null);

    // Unsplash states
    const [unsplashModalOpen, setUnsplashModalOpen] = useState(false);
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState([]);
    const [unsplashLoading, setUnsplashLoading] = useState(false);
    const [targetPostId, setTargetPostId] = useState(null);

    const fileInputRef = useRef(null);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const q = query(collection(db, 'posts'), where('status', '==', 'pending'));
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
            setPosts(data);
            setImageLoadErrors({});
        } catch (e) {
            console.error("Erro ao buscar posts:", e);
            setErrorMsg("Erro ao carregar posts.");
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    useEffect(() => {
        if (errorMsg) {
            const timer = setTimeout(() => setErrorMsg(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [errorMsg]);

    // Handlers
    const handleApprove = async (id) => {
        try {
            await updateDoc(doc(db, 'posts', id), { status: 'approved' });
            fetchPosts();
            setExpandedPost(null);
            setEditingPost(null);
        } catch (error) {
            console.error("Error approving:", error);
            setErrorMsg("Falha ao aprovar.");
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este post?')) {
            try {
                await deleteDoc(doc(db, 'posts', id));
                fetchPosts();
                setExpandedPost(null);
                setEditingPost(null);
            } catch (error) {
                console.error("Error deleting:", error);
                setErrorMsg("Falha ao excluir.");
            }
        }
    };

    const safeContent = (content) => {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (typeof content === 'object') return content.body || content.text || content.headline || JSON.stringify(content);
        return String(content);
    };

    const handleEdit = (post) => {
        setEditingPost(post.id);
        setEditedContent(safeContent(post.content));
        setEditedImageUrl(post.imageUrl || '');
    };

    const handleSaveEdit = async (postId) => {
        try {
            await updateDoc(doc(db, 'posts', postId), {
                content: editedContent,
                imageUrl: editedImageUrl
            });
            setImageLoadErrors(prev => ({ ...prev, [postId]: false }));
            fetchPosts();
            setEditingPost(null);
        } catch (error) {
            console.error("Error updating:", error);
            setErrorMsg("Falha ao salvar edição.");
        }
    };

    const handleCancelEdit = () => {
        setEditingPost(null);
    };

    const handleRegenerateImage = async (post) => {
        setRegeneratingImage(post.id);
        setErrorMsg(null);
        try {
            const getApiUrl = (ep) => {
                const host = window.location.hostname;
                if (host === 'localhost' || host === '127.0.0.1') return `http://localhost:3000/api/${ep}`;
                return `/api/${ep}`;
            };
            
            const response = await fetch(getApiUrl('regenerate-image'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    postId: post.id, 
                    prompt: post.imagePrompt || `Photo about ${post.topic}` 
                })
            });
            const result = await response.json();
            
            if (result.success) {
                setPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: result.imageUrl, modelUsed: result.modelUsed } : p));
                setImageLoadErrors(prev => ({ ...prev, [post.id]: false }));
            } else {
                setErrorMsg(`Erro: ${result.error}`);
            }
        } catch (error) {
            setErrorMsg("Falha ao regenerar (Rede/Servidor).");
        } finally {
            setRegeneratingImage(null);
        }
    };

    const handleUploadClick = (postId) => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.dataset.postId = postId;
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        const postId = e.target.dataset.postId;
        if (!file || !postId) return;
        
        if (file.size > 30 * 1024 * 1024) {
            setErrorMsg("Arquivo muito grande (Max 30MB).");
            return;
        }

        setUploadingImage(postId);
        setErrorMsg(null);

        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const getApiUrl = (ep) => {
                    const host = window.location.hostname;
                    if (host === 'localhost' || host === '127.0.0.1') return `http://localhost:3000/api/${ep}`;
                    return `/api/${ep}`;
                };

                const response = await fetch(getApiUrl('manual-upload'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: reader.result, postId: postId })
                });
                
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                     throw new Error("Erro no servidor (possível limite de tamanho excedido no Backend).");
                }

                const result = await response.json();
                
                if (result.success) {
                    setPosts(prev => prev.map(p => p.id === postId ? { ...p, imageUrl: result.imageUrl, modelUsed: 'Manual Upload', manualRequired: false } : p));
                    setImageLoadErrors(prev => ({ ...prev, [postId]: false }));
                } else {
                    setErrorMsg(`Erro no upload: ${result.error}`);
                }
            } catch (err) {
                setErrorMsg(`Erro de conexão: ${err.message}`);
            } finally {
                setUploadingImage(null);
            }
        };
        reader.readAsDataURL(file);
    };

    const openUnsplashModal = (post) => {
        setTargetPostId(post.id);
        setUnsplashQuery(post.topic || "business");
        setUnsplashResults([]);
        setUnsplashModalOpen(true);
        handleUnsplashSearch(post.topic || "business");
    };

    const handleUnsplashSearch = async (term) => {
        if (!term) return;
        setUnsplashLoading(true);
        try {
            const getApiUrl = (ep) => {
                const host = window.location.hostname;
                if (host === 'localhost' || host === '127.0.0.1') return `http://localhost:3000/api/${ep}`;
                return `/api/${ep}`;
            };
            const res = await fetch(getApiUrl('unsplash-search'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: term })
            });
            const data = await res.json();
            if (data.success) setUnsplashResults(data.results);
            else setErrorMsg(data.error);
        } catch (e) { setErrorMsg("Erro na busca Unsplash."); }
        setUnsplashLoading(false);
    };

    const selectUnsplashImage = async (img) => {
        if (!targetPostId) return;
        setPosts(prev => prev.map(p => p.id === targetPostId ? { ...p, imageUrl: img.full, modelUsed: `Unsplash (${img.credit})` } : p));
        setUnsplashModalOpen(false);
        setImageLoadErrors(prev => ({ ...prev, [targetPostId]: false }));

        try {
            const getApiUrl = (ep) => {
                const host = window.location.hostname;
                if (host === 'localhost' || host === '127.0.0.1') return `http://localhost:3000/api/${ep}`;
                return `/api/${ep}`;
            };
            await fetch(getApiUrl('unsplash-select'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: targetPostId, imageUrl: img.full, credit: img.credit })
            });
        } catch (e) { console.error("Erro ao salvar Unsplash:", e); }
    };

    const truncateText = (text, maxLength = 120) => {
        const t = safeContent(text);
        return t.length > maxLength ? t.substring(0, maxLength) + '...' : t;
    };

    const toggleExpand = (postId) => {
        setExpandedPost(expandedPost === postId ? null : postId);
        if (expandedPost !== postId) setEditingPost(null);
    };

    const getPlatformIcon = (platform) => {
        if (platform === 'instagram') return <Instagram className="w-4 h-4 text-pink-400" />;
        return <Linkedin className="w-4 h-4 text-blue-400" />;
    };

    const handleImageError = (postId) => {
        setImageLoadErrors(prev => ({ ...prev, [postId]: true }));
    };

    const renderMediaArea = (post, isEditing, currentImageUrl, hasImageError) => {
        const isPdf = post.mediaType === 'pdf'; 
        const needsManual = post.manualRequired && !currentImageUrl; 

        if (isPdf) {
            return (
                <div className="h-64 w-full bg-gray-900 relative flex flex-col items-center justify-center p-6 border-b border-gray-700">
                    <FileText className="w-16 h-16 text-red-500 mb-4" />
                    
                    <div className="flex flex-col gap-3 w-full max-w-xs z-10">
                        {needsManual ? (
                            <div className="text-center animate-pulse">
                                <p className="text-yellow-400 text-sm mb-2 font-bold flex items-center justify-center gap-2">
                                    <AlertTriangle className="w-4 h-4"/> Download Automático Falhou
                                </p>
                                <div className="flex gap-2 justify-center">
                                    {post.originalPdfUrl && (
                                        <a href={post.originalPdfUrl} target="_blank" rel="noopener noreferrer" className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded flex items-center gap-2 text-xs font-bold w-full justify-center">
                                            <Download className="w-3 h-3" /> Baixar Original
                                        </a>
                                    )}
                                </div>
                                <button onClick={() => handleUploadClick(post.id)} className="mt-2 w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded flex items-center justify-center gap-2 text-xs font-bold">
                                    <Upload className="w-3 h-3" /> Fazer Upload do PDF
                                </button>
                            </div>
                        ) : (
                            currentImageUrl ? (
                                <a href={currentImageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-medium transition-colors">
                                    <Download className="w-4 h-4" /> Ver PDF Gerado
                                </a>
                            ) : (
                                <div className="text-center text-gray-500">Sem PDF. Use Upload Manual.</div>
                            )
                        )}

                        {post.originalPdfUrl && !needsManual && (
                            <a href={post.originalPdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm border border-gray-600 transition-colors">
                                <ExternalLink className="w-4 h-4" /> Fonte Original ({post.modelUsed?.split(':')[0]})
                            </a>
                        )}
                    </div>

                    {!needsManual && !isEditing && (
                        <div className="absolute top-3 right-3">
                            <button onClick={(e) => { e.stopPropagation(); handleUploadClick(post.id); }} disabled={uploadingImage === post.id} className="bg-blue-600/90 hover:bg-blue-600 text-white p-2 rounded-full shadow-lg transition-all" title="Trocar PDF">
                                {uploadingImage === post.id ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                            </button>
                        </div>
                    )}

                    <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs text-white font-medium flex items-center gap-1">
                        <Wand2 className="w-3 h-3 text-purple-400" /> {post.modelUsed || "ArXiv"}
                    </div>
                </div>
            );
        }

        return (
            <div className="h-64 w-full bg-gray-900 relative group flex items-center justify-center overflow-hidden">
                
                {/* --- ADIÇÃO: TAGS DE RASTREABILIDADE --- */}
                {post.metaIndexes && (
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-20 pointer-events-none">
                        {post.metaIndexes.context && (
                            <span className="bg-black/70 backdrop-blur text-yellow-400 text-[10px] font-mono px-2 py-1 rounded border border-yellow-500/30 shadow-lg font-bold">
                                CTX #{post.metaIndexes.context}
                            </span>
                        )}
                        <span className="bg-black/70 backdrop-blur text-blue-400 text-[10px] font-mono px-2 py-1 rounded border border-blue-500/30 shadow-lg font-bold">
                            TOP #{post.metaIndexes.topic}
                        </span>
                    </div>
                )}
                {/* --------------------------------------- */}

                {currentImageUrl && !hasImageError ? (
                    <img src={currentImageUrl} alt={post.topic} className="w-full h-full object-cover" onError={() => handleImageError(post.id)} />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-500"><ImageOff className="w-8 h-8"/><span>No Image</span></div>
                )}
                
                {!isEditing && (
                    <div className="absolute top-3 right-3 flex gap-2 z-10">
                        <button onClick={(e) => { e.stopPropagation(); openUnsplashModal(post); }} className="bg-white/90 hover:bg-white text-black p-2 rounded-full shadow-lg transition-all" title="Buscar no Unsplash">
                            <Camera className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRegenerateImage(post); }} disabled={regeneratingImage === post.id} className="bg-purple-600/90 hover:bg-purple-600 text-white p-2 rounded-full shadow-lg transition-all" title="Regenerar (IA)">
                            <RefreshCw className={`w-4 h-4 ${regeneratingImage === post.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleUploadClick(post.id); }} disabled={uploadingImage === post.id} className="bg-blue-600/90 hover:bg-blue-600 text-white p-2 rounded-full shadow-lg transition-all" title="Upload Manual">
                            {uploadingImage === post.id ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4" />}
                        </button>
                    </div>
                )}
                
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs text-white font-medium flex items-center gap-1">
                    <Wand2 className="w-3 h-3 text-purple-400" /> {post.modelUsed || "Unknown"}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-white">Content Approvals</h2>
                <button onClick={fetchPosts} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-blue-400 px-4 py-2 rounded-lg border border-gray-700">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {errorMsg && (
                <div className="fixed top-20 right-4 z-50 bg-red-900/90 border border-red-500 text-white px-6 py-4 rounded-lg shadow-2xl animate-fadeIn flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-200" />
                    <div><p className="font-bold">Erro</p><p className="text-sm text-red-100">{errorMsg}</p></div>
                    <button onClick={() => setErrorMsg(null)} className="ml-4 text-red-300 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

            {/* MODAL UNSPLASH */}
            {unsplashModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Camera className="w-6 h-6" /> Select from Unsplash</h3>
                            <button onClick={() => setUnsplashModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-4 flex gap-2">
                            <input 
                                type="text" 
                                value={unsplashQuery} 
                                onChange={(e) => setUnsplashQuery(e.target.value)} 
                                onKeyPress={(e) => e.key === 'Enter' && handleUnsplashSearch(unsplashQuery)} 
                                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 outline-none" 
                                placeholder="Search photos..." 
                            />
                            <button onClick={() => handleUnsplashSearch(unsplashQuery)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"><Search className="w-5 h-5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                            {unsplashLoading ? (
                                <div className="col-span-full text-center py-10 text-gray-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2"/>Searching...</div>
                            ) : unsplashResults.length > 0 ? (
                                unsplashResults.map(img => (
                                    <div key={img.id} className="relative group cursor-pointer aspect-video bg-gray-800 rounded-lg overflow-hidden" onClick={() => selectUnsplashImage(img)}>
                                        <img src={img.thumb} alt="Unsplash" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="text-white font-bold">Select</span>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-gray-300 p-1 truncate px-2">by {img.credit}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full text-center py-10 text-gray-500">No results found.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* LISTA DE POSTS */}
            {loading ? (
                <div className="text-center text-gray-400 py-12">Loading posts...</div>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => {
                        const isExpanded = expandedPost === post.id;
                        const isEditing = editingPost === post.id;
                        const currentImageUrl = isEditing ? editedImageUrl : post.imageUrl;
                        const hasImageError = imageLoadErrors[post.id];

                        return (
                            <div key={post.id} className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 overflow-hidden transition-all duration-300">
                                <div className="p-4 md:p-6 cursor-pointer hover:bg-gray-700/30 transition-colors" onClick={() => toggleExpand(post.id)}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                {getPlatformIcon(post.platform)}
                                                <h3 className="text-lg font-semibold text-white truncate">{post.topic}</h3>
                                                <div className="px-3 py-1 rounded-full text-xs font-medium border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">PENDING</div>
                                                
                                                {post.promptSlot && (
                                                    <div className="px-2 py-1 rounded text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1" title="Configuração de Prompt usada">
                                                        <Layers className="w-3 h-3" />Slot {post.promptSlot}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center text-gray-500 text-xs space-x-1 mb-3">
                                                <Calendar className="w-3 h-3" />
                                                <span>{post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                                            </div>
                                            {!isExpanded && <p className="text-gray-400 text-sm line-clamp-2">{truncateText(safeContent(post.content))}</p>}
                                        </div>
                                        <button className="flex-shrink-0 text-gray-400 hover:text-white transition-colors">
                                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-700 animate-fadeIn">
                                        
                                        {/* ÁREA DE MÍDIA */}
                                        {renderMediaArea(post, isEditing, currentImageUrl, hasImageError)}

                                        <div className="p-4 md:p-6 space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-sm font-semibold text-gray-400">Content:</h4>
                                                    {!isEditing && (
                                                        <button onClick={(e) => { e.stopPropagation(); handleEdit(post); }} className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
                                                            <Edit2 className="w-3 h-3" /> Edit
                                                        </button>
                                                    )}
                                                </div>
                                                {isEditing ? (
                                                    <div className="space-y-3">
                                                        <textarea 
                                                            value={editedContent} 
                                                            onChange={(e) => setEditedContent(e.target.value)} 
                                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm min-h-[150px] focus:border-blue-500 outline-none"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <div>
                                                            <label className="text-xs text-gray-400 mb-1 block">Image URL:</label>
                                                            <input 
                                                                type="text" 
                                                                value={editedImageUrl} 
                                                                onChange={(e) => setEditedImageUrl(e.target.value)} 
                                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs focus:border-blue-500 outline-none"
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(post.id); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">
                                                                <Save className="w-4 h-4" /> Save
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">
                                                                <X className="w-4 h-4" /> Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{safeContent(post.content)}</p>
                                                )}
                                            </div>
                                            
                                            {post.imagePrompt && !isEditing && (
                                                <div>
                                                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Image Prompt:</h4>
                                                    <p className="text-gray-400 text-xs italic">{post.imagePrompt}</p>
                                                </div>
                                            )}
                                            
                                            <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-gray-700">
                                                <button onClick={(e) => { e.stopPropagation(); handleApprove(post.id); }} className="flex-1 flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg transition-colors">
                                                    <Check className="w-4 h-4" /><span>Approve</span>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleReject(post.id); }} className="flex-1 flex items-center justify-center space-x-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 py-3 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" /><span>Reject</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {posts.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            No pending posts. All posts have been reviewed!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}