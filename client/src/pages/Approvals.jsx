import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, updateDoc, doc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Check, X, Clock, Calendar, ChevronDown, ChevronUp, Linkedin, Instagram, Edit2, Save, RefreshCw } from 'lucide-react';

export default function Approvals() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);
    const [editingPost, setEditingPost] = useState(null);
    const [editedContent, setEditedContent] = useState('');
    const [editedImageUrl, setEditedImageUrl] = useState('');
    const [regeneratingImage, setRegeneratingImage] = useState(null);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'posts'),
                where('status', '==', 'pending')
            );
            
            const querySnapshot = await getDocs(q);
            const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            //Sort by createdAt on client side
            postsData.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() || new Date(0);
                const bTime = b.createdAt?.toDate?.() || new Date(0);
                return bTime - aTime;
            });
            setPosts(postsData);
        } catch (error) {
            console.error("Error fetching posts:", error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const handleApprove = async (id) => {
        try {
            await updateDoc(doc(db, 'posts', id), { status: 'approved' });
            fetchPosts();
            setExpandedPost(null);
            setEditingPost(null);
        } catch (error) {
            console.error("Error approving post:", error);
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Are you sure you want to delete this post?')) {
            try {
                await deleteDoc(doc(db, 'posts', id));
                fetchPosts();
                setExpandedPost(null);
                setEditingPost(null);
            } catch (error) {
                console.error("Error deleting post:", error);
            }
        }
    };

    // Helper para garantir que o conteúdo seja sempre string
    const safeContent = (content) => {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (typeof content === 'object') {
            return content.body || content.text || content.headline || JSON.stringify(content);
        }
        return String(content);
    };

    const handleEdit = (post) => {
        setEditingPost(post.id);
        // Usa o helper safeContent para evitar quebra no Textarea
        setEditedContent(safeContent(post.content));
        setEditedImageUrl(post.imageUrl || '');
    };

    const handleSaveEdit = async (postId) => {
        try {
            await updateDoc(doc(db, 'posts', postId), {
                content: editedContent,
                imageUrl: editedImageUrl
            });
            fetchPosts();
            setEditingPost(null);
        } catch (error) {
            console.error("Error updating post:", error);
        }
    };

    const handleRegenerateImage = async (post) => {
        setRegeneratingImage(post.id);
        try {
            // Generate new image with random seed
            const imagePrompt = post.imagePrompt || "Professional business workspace with technology";
            const encodedPrompt = encodeURIComponent(imagePrompt);
            const randomSeed = Math.floor(Math.random() * 10000);
            const newImageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
            
            await updateDoc(doc(db, 'posts', post.id), {
                imageUrl: newImageUrl
            });
            fetchPosts();
        } catch (error) {
            console.error("Error regenerating image:", error);
        } finally {
            setRegeneratingImage(null);
        }
    };

    const truncateText = (text, maxLength = 120) => {
        // Usa o helper safeContent antes de tentar cortar
        const safeText = safeContent(text);
        return safeText.length > maxLength ? safeText.substring(0, maxLength) + '...' : safeText;
    };

    const toggleExpand = (postId) => {
        setExpandedPost(expandedPost === postId ? null : postId);
        if (expandedPost !== postId) {
            setEditingPost(null);
        }
    };

    const getPlatformIcon = (platform) => {
        if (platform === 'instagram') {
            return <Instagram className="w-4 h-4 text-pink-400" />;
        }
        // Default to LinkedIn
        return <Linkedin className="w-4 h-4 text-blue-400" />;
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-3xl font-bold text-white">Content Approvals</h2>
                <button
                    onClick={fetchPosts}
                    className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-blue-400 px-4 py-2 rounded-lg transition-colors border border-gray-700"
                >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                </button>
            </div>

            {loading ? (
                <div className="text-center text-gray-400 py-12">Loading posts...</div>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => {
                        const isExpanded = expandedPost === post.id;
                        const isEditing = editingPost === post.id;

                        return (
                            <div
                                key={post.id}
                                className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 overflow-hidden transition-all duration-300"
                            >
                                {/* Card Header - Always Visible */}
                                <div
                                    className="p-4 md:p-6 cursor-pointer hover:bg-gray-700/30 transition-colors"
                                    onClick={() => toggleExpand(post.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                {getPlatformIcon(post.platform)}
                                                <h3 className="text-lg font-semibold text-white">{post.topic}</h3>
                                                <div className="px-3 py-1 rounded-full text-xs font-medium border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                                    PENDING
                                                </div>
                                            </div>
                                            <div className="flex items-center text-gray-500 text-xs space-x-1 mb-3">
                                                <Calendar className="w-3 h-3" />
                                                <span>{post.createdAt?.toDate ?
                                                    new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                                            </div>
                                            {!isExpanded && (
                                                <p className="text-gray-400 text-sm line-clamp-2">
                                                    {truncateText(post.content)}
                                                </p>
                                            )}
                                        </div>
                                        <button className="flex-shrink-0 text-gray-400 hover:text-white transition-colors">
                                            {isExpanded ?
                                                <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="border-t border-gray-700 animate-fadeIn">
                                        {(post.imageUrl || editedImageUrl) && (
                                            <div className="h-64 w-full bg-gray-900 relative group">
                                                <img
                                                    src={isEditing ? editedImageUrl : post.imageUrl}
                                                    alt={post.topic}
                                                    className="w-full h-full object-cover"
                                                />
                                                {!isEditing && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRegenerateImage(post);
                                                        }}
                                                        disabled={regeneratingImage === post.id}
                                                        className="absolute top-2 right-2 bg-gray-900/80 hover:bg-gray-800 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                                        title="Regenerate image"
                                                    >
                                                        <RefreshCw className={`w-4 h-4 ${regeneratingImage === post.id ?
                                                            'animate-spin' : ''}`} />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="p-4 md:p-6 space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-sm font-semibold text-gray-400">Content:</h4>
                                                    {!isEditing && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEdit(post);
                                                            }}
                                                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                                                        >
                                                            <Edit2 className="w-3 h-3" />
                                                            Edit
                                                        </button>
                                                    )}
                                                </div>
                                                {isEditing ? (
                                                    <div className="space-y-3">
                                                        <textarea
                                                            value={editedContent}
                                                            onChange={(e) => setEditedContent(e.target.value)}
                                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm min-h-[120px] focus:border-blue-500 outline-none"
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
                                                                placeholder="https://..."
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSaveEdit(post.id);
                                                            }}
                                                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
                                                        >
                                                            <Save className="w-4 h-4" />
                                                            Save Changes
                                                        </button>
                                                    </div>
                                                ) : (
                                                    // Proteção aqui também:
                                                    <p className="text-gray-300 text-sm whitespace-pre-wrap">
                                                        {safeContent(post.content)}
                                                    </p>
                                                )}
                                            </div>

                                            {post.imagePrompt && !isEditing && (
                                                <div>
                                                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Image Prompt:</h4>
                                                    <p className="text-gray-400 text-xs italic">{post.imagePrompt}</p>
                                                </div>
                                            )}

                                            <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-gray-700">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleApprove(post.id);
                                                    }}
                                                    className="flex-1 flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg transition-colors"
                                                >
                                                    <Check className="w-4 h-4" />
                                                    <span>Approve</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleReject(post.id);
                                                    }}
                                                    className="flex-1 flex items-center justify-center space-x-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 py-3 rounded-lg transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                    <span>Reject</span>
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