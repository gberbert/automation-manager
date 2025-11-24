import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

export default function Published() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'posts'),
                where('status', '==', 'published')
            );
            const querySnapshot = await getDocs(q);
            const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by publishedAt on client side
            postsData.sort((a, b) => {
                const aTime = a.publishedAt?.toDate?.() || new Date(0);
                const bTime = b.publishedAt?.toDate?.() || new Date(0);
                return bTime - aTime;
            });
            setPosts(postsData);
        } catch (error) {
            console.error("Error fetching posts:", error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPosts();
    }, [fetchPosts]);

    const truncateText = (text, maxLength = 120) => {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    const toggleExpand = (postId) => {
        setExpandedPost(expandedPost === postId ? null : postId);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-3xl font-bold text-white">Published Posts</h2>
                <button
                    onClick={fetchPosts}
                    className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-blue-400 px-4 py-2 rounded-lg transition-colors border border-gray-700"
                >
                    <CheckCircle className="w-4 h-4" />
                    <span>Refresh</span>
                </button>
            </div>

            {loading ? (
                <div className="text-center text-gray-400 py-12">Loading posts...</div>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => {
                        const isExpanded = expandedPost === post.id;

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
                                                <div className="px-3 py-1 rounded-full text-xs font-medium border bg-blue-500/20 text-blue-400 border-blue-500/30">
                                                    PUBLISHED
                                                </div>
                                            </div>
                                            <div className="flex items-center text-gray-500 text-xs space-x-1 mb-3">
                                                <Calendar className="w-3 h-3" />
                                                <span>Published: {post.publishedAt?.toDate ? new Date(post.publishedAt.toDate()).toLocaleDateString() : 'N/A'}</span>
                                            </div>
                                            {!isExpanded && (
                                                <p className="text-gray-400 text-sm line-clamp-2">
                                                    {truncateText(post.content)}
                                                </p>
                                            )}
                                        </div>
                                        <button className="flex-shrink-0 text-gray-400 hover:text-white transition-colors">
                                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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

                                            <div className="flex items-center justify-center space-x-2 text-blue-400 pt-4 border-t border-gray-700">
                                                <CheckCircle className="w-4 h-4" />
                                                <span>Successfully Published</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {posts.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            No published posts yet. Published posts will appear here!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
