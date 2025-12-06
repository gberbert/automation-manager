import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, query, getDocs, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Clock, Calendar, ChevronDown, ChevronUp, Send, Loader2, Edit2, Trash2, Save, ImageOff, X, AlertCircle, FileText, Download, ExternalLink, AlertTriangle, Camera, RefreshCw, Upload, Check, Search, Image as ImageIcon, Wand2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.8 : 1 };

    return (
        <div ref={setNodeRef} style={style} className={`bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 overflow-hidden ${isDragging ? 'shadow-2xl ring-2 ring-blue-500 bg-gray-700' : ''}`}>
            <div {...attributes} {...listeners} className="absolute left-0 top-0 bottom-0 w-8 bg-gray-900/50 hover:bg-blue-600/30 cursor-grab flex items-center justify-center z-20 group transition-colors border-r border-gray-700/50">
                <GripVertical className="w-5 h-5 text-gray-500 group-hover:text-blue-400" />
            </div>
            <div className="pl-8">
                {children}
            </div>
        </div>
    );
}

export default function Approved() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);

    // Estados
    const [publishingId, setPublishingId] = useState(null);
    const [publishStep, setPublishStep] = useState('');
    const [editingPost, setEditingPost] = useState(null);
    const [editedContent, setEditedContent] = useState('');
    const [editedImageUrl, setEditedImageUrl] = useState('');
    // Processamento
    const [regeneratingImage, setRegeneratingImage] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(null);
    const [imageLoadErrors, setImageLoadErrors] = useState({});
    const [errorMsg, setErrorMsg] = useState(null);

    // Unsplash
    const [unsplashModalOpen, setUnsplashModalOpen] = useState(false);
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState([]);
    const [unsplashLoading, setUnsplashLoading] = useState(false);
    const [targetPostId, setTargetPostId] = useState(null);

    const fileInputRef = useRef(null);

    // --- DRAG AND DROP ---
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setPosts((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                const orderedIds = newOrder.map(p => p.id);
                fetch(getApiUrl('reorder-posts'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderedIds })
                }).catch(console.error);

                return newOrder;
            });
        }
    };
    // --- HELPER DE URL INTELIGENTE ---
    const getApiUrl = (endpoint) => {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return `http://localhost:3000/api/${endpoint}`;
        }
        return `/api/${endpoint}`;
    };
    // --- FETCH ---
    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'posts'), where('status', '==', 'approved'));
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // ORDENAÇÃO: Ordem definida pelo usuário (ASC) -> Se igual, mais antigo primeiro (FIFO)
            data.sort((a, b) => {
                const orderA = a.publicationOrder ?? 999999;
                const orderB = b.publicationOrder ?? 999999;
                if (orderA !== orderB) return orderA - orderB;
                return (a.createdAt?.toDate?.() || 0) - (b.createdAt?.toDate?.() || 0);
            });
            setPosts(data);
            setImageLoadErrors({});
        } catch (e) { setErrorMsg("Erro ao carregar posts."); }
        setLoading(false);
    }, []);
    useEffect(() => { fetchPosts(); }, [fetchPosts]);
    useEffect(() => { if (errorMsg) setTimeout(() => setErrorMsg(null), 8000); }, [errorMsg]);
    // --- PUBLICAÇÃO (DEBUG ATIVADO) ---
    const handlePublishNow = async (post) => {
        if (publishingId) return;
        setPublishingId(post.id);
        setErrorMsg(null);

        try {
            let assetUrn = null;
            const isPdf = post.mediaType === 'pdf';

            // 1. Upload Prévio (Asset Upload)
            if (post.imageUrl) {
                setPublishStep('Uploading Asset...');
                try {
                    const uploadRes = await fetch(getApiUrl('upload-media'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imageUrl: post.imageUrl,
                            mediaType: post.mediaType || 'image'
                        })
                    });

                    const uploadData = await uploadRes.json();
                    if (uploadRes.ok && uploadData.success && uploadData.assetUrn) {
                        assetUrn = uploadData.assetUrn;
                    } else {
                        console.error("Erro Backend Upload:", uploadData);
                        // MOSTRA O ERRO REAL DO BACKEND
                        const backendError = uploadData.error || "Erro desconhecido no servidor";

                        if (isPdf) {
                            throw new Error(`Falha no Upload do PDF: ${backendError}`);
                        }
                    }
                } catch (err) {
                    // Se o erro já foi lançado acima, repassa. Se for rede, avisa.
                    throw new Error(err.message || "Erro de conexão ao tentar subir o arquivo.");
                }
            }

            // Validação de Segurança
            if (isPdf && !assetUrn) {
                throw new Error("O sistema não recebeu o ID do arquivo (Asset URN). O upload falhou.");
            }

            // 2. Publicar (Create Post)
            setPublishStep('Posting...');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s

            const pubRes = await fetch(getApiUrl(`publish-now/${post.id}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaAsset: assetUrn }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const pubData = await pubRes.json();
            if (!pubRes.ok) {
                throw new Error(`Erro LinkedIn: ${pubData.error || 'Falha na publicação'}`);
            }

            alert('✅ Published Successfully!');
            fetchPosts();
            setExpandedPost(null);
        } catch (error) {
            if (error.name === 'AbortError') alert("⚠️ Timeout: O LinkedIn demorou para responder.");
            else {
                console.error(error);
                alert(`❌ ${error.message}`);
            }
        } finally {
            setPublishingId(null);
            setPublishStep('');
        }
    };

    // --- OUTRAS AÇÕES ---
    const handleRegenerateImage = async (post) => {
        setRegeneratingImage(post.id);
        try {
            const res = await fetch(getApiUrl('regenerate-image'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: post.id, prompt: post.imagePrompt }) });
            const data = await res.json();
            if (data.success) {
                setPosts(prev => prev.map(p => p.id === post.id ? { ...p, imageUrl: data.imageUrl, modelUsed: data.modelUsed } : p));
                setImageLoadErrors(p => ({ ...p, [post.id]: false }));
            } else setErrorMsg(data.error);
        } catch (e) { setErrorMsg("Falha regeneração."); } finally {
            setRegeneratingImage(null);
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        const pid = e.target.dataset.postId;
        if (!file || !pid) return;
        if (file.size > 30 * 1024 * 1024) return setErrorMsg("Max 30MB");
        setUploadingImage(pid);
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const res = await fetch(getApiUrl('manual-upload'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: reader.result, postId: pid }) });
                const d = await res.json();
                if (d.success) {
                    setPosts(prev => prev.map(p => p.id === pid ? { ...p, imageUrl: d.imageUrl, modelUsed: 'Manual', manualRequired: false } : p));
                    setImageLoadErrors(p => ({ ...p, [pid]: false }));
                } else setErrorMsg(d.error);
            } catch (err) {
                setErrorMsg(err.message);
            }
            setUploadingImage(null);
        };
        reader.readAsDataURL(file);
    };
    const handleUnsplashSearch = async (term) => {
        if (!term) return; setUnsplashLoading(true);
        try {
            const res = await fetch(getApiUrl('unsplash-search'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: term }) });
            const data = await res.json();
            if (data.success) setUnsplashResults(data.results); else setErrorMsg(data.error);
        } catch (e) { setErrorMsg("Erro Unsplash."); } setUnsplashLoading(false);
    };
    const selectUnsplashImage = async (img) => {
        if (!targetPostId) return;
        setPosts(prev => prev.map(p => p.id === targetPostId ? { ...p, imageUrl: img.full, modelUsed: `Unsplash` } : p));
        setUnsplashModalOpen(false);
    };
    const handleApprove = async (id) => { await updateDoc(doc(db, 'posts', id), { status: 'approved' }); fetchPosts(); setExpandedPost(null); };
    const handleReject = async (id) => { if (confirm('Delete permanently?')) { await deleteDoc(doc(db, 'posts', id)); fetchPosts(); } };
    const handleEdit = (p) => { setEditingPost(p.id); setEditedContent(typeof p.content === 'string' ? p.content : JSON.stringify(p.content)); setEditedImageUrl(p.imageUrl || ''); };
    const handleSaveEdit = async (pid) => {
        await updateDoc(doc(db, 'posts', pid), { content: editedContent, imageUrl: editedImageUrl });
        setImageLoadErrors(p => ({ ...p, [pid]: false })); fetchPosts(); setEditingPost(null);
    };
    const handleUploadClick = (pid) => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.dataset.postId = pid; fileInputRef.current.click(); } };
    const openUnsplashModal = (p) => { setTargetPostId(p.id); setUnsplashQuery(p.topic); setUnsplashResults([]); setUnsplashModalOpen(true); handleUnsplashSearch(p.topic); };
    const toggleExpand = (pid) => { setExpandedPost(expandedPost === pid ? null : pid); if (expandedPost !== pid) setEditingPost(null); };

    // RENDERER COM TAGS (NOVO)
    const renderMedia = (post, url, err) => {
        return (
            <div className="h-64 bg-gray-900 relative group flex items-center justify-center overflow-hidden">
                {/* TAGS */}
                {post.metaIndexes && (
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-20 pointer-events-none">
                        {post.metaIndexes.context && <span className="bg-black/70 backdrop-blur text-yellow-400 text-[10px] font-mono px-2 py-1 rounded border border-yellow-500/30 shadow-lg font-bold">CTX #{post.metaIndexes.context}</span>}
                        <span className="bg-black/70 backdrop-blur text-blue-400 text-[10px] font-mono px-2 py-1 rounded border border-blue-500/30 shadow-lg font-bold">TOP #{post.metaIndexes.topic}</span>
                    </div>
                )}

                {/* IMAGEM DE FUNDO (CAPA) */}
                {url && !err ? (
                    <img src={url} className="w-full h-full object-cover transition-opacity group-hover:opacity-90" onError={() => setImageLoadErrors(p => ({ ...p, [post.id]: true }))} />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-500"><ImageOff className="w-8 h-8" /><span>No Image</span></div>
                )}

                {/* BOTÃO DISCRETO PDF */}
                {post.mediaType === 'pdf' && post.originalPdfUrl && (
                    <div className="absolute bottom-3 left-3 z-30">
                        <a
                            href={post.originalPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg backdrop-blur-sm transition-all border border-red-500/50"
                            title="Ler PDF Original"
                        >
                            <FileText className="w-4 h-4" />
                            <span>LER PDF</span>
                        </a>
                    </div>
                )}

                {!editingPost && (
                    <div className="absolute top-3 right-3 flex gap-2 z-10">
                        <button onClick={(e) => { e.stopPropagation(); openUnsplashModal(post) }} className="bg-white/90 p-2 rounded-full shadow hover:bg-white"><Camera className="w-4 h-4 text-black" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleRegenerateImage(post) }} disabled={regeneratingImage === post.id} className="bg-purple-600/90 p-2 rounded-full text-white shadow hover:bg-purple-500"><RefreshCw className={`w-4 h-4 ${regeneratingImage === post.id ? 'animate-spin' : ''}`} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleUploadClick(post.id) }} disabled={uploadingImage === post.id} className="bg-blue-600/90 p-2 rounded-full text-white shadow hover:bg-blue-500">{uploadingImage === post.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}</button>
                    </div>
                )}

                {/* Badge do Modelo */}
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs text-white font-medium flex items-center gap-1">
                    <Wand2 className="w-3 h-3 text-purple-400" /> {post.modelUsed?.split('+').pop().trim() || "AI Image"}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center"><h2 className="text-3xl font-bold text-white">Approved Posts</h2><button onClick={fetchPosts} className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded border border-gray-700 text-blue-400"><Clock className="w-4 h-4" /> Refresh</button></div>
            {errorMsg && <div className="fixed top-20 right-4 bg-red-900 text-white px-6 py-4 rounded border border-red-500 z-50 flex gap-3 items-center"><AlertTriangle className="w-5 h-5" />{errorMsg}<button onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button></div>}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            {unsplashModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center"><h3 className="text-xl font-bold text-white flex items-center gap-2"><Camera className="w-6 h-6" /> Select from Unsplash</h3><button onClick={() => setUnsplashModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button></div>
                        <div className="p-4 flex gap-2"><input type="text" value={unsplashQuery} onChange={e => setUnsplashQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleUnsplashSearch(unsplashQuery)} className="flex-1 bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white" /><button onClick={() => handleUnsplashSearch(unsplashQuery)} className="bg-blue-600 px-4 rounded text-white"><Search /></button></div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-4">
                            {unsplashLoading ? <div className="col-span-3 text-center text-gray-500">Loading...</div> : unsplashResults.map(img => (
                                <div key={img.id} className="relative group cursor-pointer aspect-video" onClick={() => selectUnsplashImage(img)}>
                                    <img src={img.thumb} className="w-full h-full object-cover rounded" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-bold transition-opacity">Select</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {loading ? <div className="text-center text-gray-400 py-12">Loading...</div> : (
                <div className="space-y-4">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={posts.map(p => p.id)} strategy={verticalListSortingStrategy}>
                            {posts.map((post) => {
                                const isExpanded = expandedPost === post.id;
                                const isEditing = editingPost === post.id;
                                const currentImageUrl = isEditing ? editedImageUrl : post.imageUrl;
                                const hasImageError = imageLoadErrors[post.id];

                                return (
                                    <SortableItem key={post.id} id={post.id}>
                                        <div className="p-4 cursor-pointer hover:bg-gray-700/30" onClick={() => toggleExpand(post.id)}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                        <h3 className="text-lg font-semibold text-white truncate">{post.topic}</h3>
                                                        <div className="px-3 py-1 rounded-full text-xs font-medium border bg-green-500/20 text-green-400 border-green-500/30">APPROVED</div>

                                                        {/* BADGE DE TIPO DE MÍDIA */}
                                                        <div className="px-2 py-1 rounded text-xs font-medium bg-gray-700/50 text-gray-300 border border-gray-600 flex items-center gap-1">
                                                            {post.mediaType === 'pdf' ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                                            {post.mediaType === 'pdf' ? 'PDF+Text' : 'Img+Text'}
                                                        </div>

                                                    </div>
                                                    <div className="flex items-center text-gray-500 text-xs space-x-1 mb-3">
                                                        <Calendar className="w-3 h-3" />
                                                        <span>{post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                                                    </div>
                                                </div>
                                                <button className="flex-shrink-0 text-gray-400 hover:text-white transition-colors">
                                                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="border-t border-gray-700 animate-fadeIn">
                                                {renderMedia(post, currentImageUrl, hasImageError)}
                                                <div className="p-6 space-y-4">
                                                    {editingPost === post.id ? (
                                                        <div className="space-y-3">
                                                            <textarea value={editedContent} onChange={e => setEditedContent(e.target.value)} className="w-full bg-gray-900 border-gray-700 rounded p-3 text-white min-h-[150px]" />
                                                            <div className="flex gap-2"><input type="text" value={editedImageUrl} onChange={e => setEditedImageUrl(e.target.value)} className="flex-1 bg-gray-900 border-gray-700 rounded p-2 text-white text-xs" /><button onClick={() => handleSaveEdit(post.id)} className="bg-blue-600 px-4 rounded text-white flex gap-2 items-center"><Save className="w-4 h-4" /> Save</button></div>
                                                        </div>
                                                    ) : <p className="text-gray-300 whitespace-pre-wrap">{typeof post.content === 'string' ? post.content : JSON.stringify(post.content)}</p>}
                                                    <div className="flex gap-3 pt-4 border-t border-gray-700">
                                                        {!editingPost && !publishingId && (
                                                            <>
                                                                <button onClick={(e) => { e.stopPropagation(); handleEdit(post) }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded flex justify-center gap-2"><Edit2 className="w-4 h-4" /> Edit</button>
                                                                {/* REMOVIDO RE-APPROVE DAQUI */}
                                                                <button onClick={(e) => { e.stopPropagation(); handleReject(post.id) }} className="flex-1 bg-red-600/20 text-red-400 hover:bg-red-600/40 py-2 rounded flex justify-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
                                                            </>
                                                        )}
                                                        <button onClick={(e) => { e.stopPropagation(); handlePublishNow(post) }} disabled={publishingId === post.id} className="w-full md:w-auto ml-auto bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white px-6 py-2 rounded flex items-center justify-center gap-2">
                                                            {publishingId === post.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                            <span>{publishingId === post.id ? publishStep : 'Publish Now'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </SortableItem>
                                );
                            })}
                        </SortableContext>
                    </DndContext>
                    {posts.length === 0 && <div className="text-center text-gray-500 py-12">No approved posts.</div>}
                </div>
            )}
        </div>
    );
}