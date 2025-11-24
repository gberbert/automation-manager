import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Clock, Calendar, ChevronDown, ChevronUp, Send } from 'lucide-react';

export default function Approved() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);
    const [publishingId, setPublishingId] = useState(null); // Estado para loading do botão

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'posts'),
                where('status', '==', 'approved')
            );
            
            const querySnapshot = await getDocs(q);
            const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by createdAt on client side
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

    const truncateText = (text, maxLength = 120) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    const toggleExpand = (postId) => {
        setExpandedPost(expandedPost === postId ? null : postId);
    };

    const handlePublishNow = async (postId) => {
        if (publishingId) return; // Evita duplo clique
        setPublishingId(postId);

        try {
            // CORREÇÃO AQUI: Detecta se é Produção (Vercel) ou Local
            // Em produção usa caminho relativo. Local usa localhost:3000
            const apiUrl = import.meta.env.PROD 
                ? `/api/publish-now/${postId}`
                : `http://localhost:3000/api/publish-now/${postId}`;

            console.log("Chamando API em:", apiUrl);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (response.ok) {
                alert('✅ Post published successfully to LinkedIn!');
                fetchPosts();
                setExpandedPost(null);
            } else {
                alert(`❌ Error: ${result.error || 'Failed to publish to LinkedIn'}`);
            }
        } catch (error) {
            console.error("Error publishing post:", error);
            alert(`❌ Error: ${error.message}`);
        } finally {
            setPublishingId(null);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-3xl font-bold text-white">Approved Posts</h2>
                <button
                    onClick={fetchPosts}
                    className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-blue-400 px-4 py-2 rounded-lg transition-colors border border-gray-700"
                >
                    <Clock className="w-4 h-4" />
                    <span>Refresh</span>
                </button>
            </div>

            {loading ? (
                <div className="text-center text-gray-400 py-12">Loading posts...</div>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => {
                        const isExpanded = expandedPost === post.id;
                        const isPublishing = publishingId === post.id;

                        return (
                            <div
                                key={post.id}
                                className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 overflow-hidden transition-all duration-300"
                            >
                                <div
                                    className="p-4 md:p-6 cursor-pointer hover:bg-gray-700/30 transition-colors"
                                    onClick={() => toggleExpand(post.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                <h3 className="text-lg font-semibold text-white">{post.topic}</h3>
                                                <div className="px-3 py-1 rounded-full text-xs font-medium border bg-green-500/20 text-green-400 border-green-500/30">
                                                    APPROVED
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

                                {isExpanded && (
                                    <div className="border-t border-gray-700 animate-fadeIn">
                                        {post.imageUrl && (
                                            <div className="h-64 w-full bg-gray-900 relative">
                                                <img src={post.imageUrl} alt={post.topic} className="w-full h-full object-cover" />
                                            </div>
                                        )}

                                        <div className="p-4 md:p-6 space-y-4">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-400 mb-2">Content:</h4>
                                                <p className="text-gray-300 text-sm whitespace-pre-wrap">{post.content}</p>
                                            </div>

                                            {post.imagePrompt && (
                                                <div>
                                                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Image Prompt:</h4>
                                                    <p className="text-gray-400 text-xs italic">{post.imagePrompt}</p>
                                                </div>
                                            )}

                                            <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-700">
                                                <div className="flex items-center space-x-2 text-green-400">
                                                    <Clock className="w-4 h-4" />
                                                    <span>Scheduled for Next Slot</span>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePublishNow(post.id);
                                                    }}
                                                    disabled={isPublishing}
                                                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white px-4 py-2 rounded-lg transition-colors"
                                                >
                                                    <Send className={`w-4 h-4 ${isPublishing ? 'animate-pulse' : ''}`} />
                                                    <span>{isPublishing ? 'Publishing...' : 'Publish Now'}</span>
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
                            No approved posts yet. Approve some posts to see them here!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}