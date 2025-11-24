import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Clock, Calendar, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';

export default function Approved() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);
    const [publishingId, setPublishingId] = useState(null);
    const [publishStep, setPublishStep] = useState(''); // 'uploading' | 'publishing'

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'posts'), where('status', '==', 'approved'));
            const querySnapshot = await getDocs(q);
            const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            postsData.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
            setPosts(postsData);
        } catch (error) { console.error(error); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    const toggleExpand = (postId) => setExpandedPost(expandedPost === postId ? null : postId);

    const handlePublishNow = async (post) => {
        if (publishingId) return;
        setPublishingId(post.id);
        
        const getApiUrl = (endpoint) => import.meta.env.PROD 
            ? `/api/${endpoint}` 
            : `http://localhost:3000/api/${endpoint}`;

        try {
            let assetUrn = null;

            // PASSO 1: Upload de Imagem (se houver)
            if (post.imageUrl) {
                setPublishStep('Uploading Image...');
                try {
                    const uploadRes = await fetch(getApiUrl('upload-media'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageUrl: post.imageUrl })
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData.success) {
                        assetUrn = uploadData.assetUrn;
                    }
                } catch (err) {
                    console.warn("Image upload failed, falling back to link:", err);
                }
            }

            // PASSO 2: Publicar Post
            setPublishStep('Publishing Post...');
            const pubRes = await fetch(getApiUrl(`publish-now/${post.id}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaAsset: assetUrn }) // Envia o ID da imagem se tiver
            });

            const pubData = await pubRes.json();

            if (pubRes.ok) {
                alert('✅ Published successfully!');
                fetchPosts();
                setExpandedPost(null);
            } else {
                throw new Error(pubData.error || 'Publish failed');
            }

        } catch (error) {
            alert(`❌ Error: ${error.message}`);
        } finally {
            setPublishingId(null);
            setPublishStep('');
        }
    };

    // Helper simples para cortar texto
    const truncate = (str) => str?.length > 100 ? str.substring(0, 100) + '...' : str;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-white">Approved Posts</h2>
                <button onClick={fetchPosts} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-blue-400 px-4 py-2 rounded-lg border border-gray-700">
                    <Clock className="w-4 h-4" /> Refresh
                </button>
            </div>

            {loading ? <div className="text-center text-gray-400 py-12">Loading...</div> : (
                <div className="space-y-4">
                    {posts.map((post) => {
                        const isExpanded = expandedPost === post.id;
                        const isPublishing = publishingId === post.id;

                        return (
                            <div key={post.id} className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700 overflow-hidden">
                                <div className="p-4 cursor-pointer hover:bg-gray-700/30" onClick={() => toggleExpand(post.id)}>
                                    <div className="flex justify-between gap-4">
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-white mb-1">{post.topic}</h3>
                                            {!isExpanded && <p className="text-gray-400 text-sm">{truncate(typeof post.content === 'string' ? post.content : 'JSON Content')}</p>}
                                        </div>
                                        {isExpanded ? <ChevronUp className="text-gray-400"/> : <ChevronDown className="text-gray-400"/>}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-700 animate-fadeIn">
                                        {post.imageUrl && <img src={post.imageUrl} className="w-full h-64 object-cover" alt="Post" />}
                                        <div className="p-6 space-y-4">
                                            <p className="text-gray-300 whitespace-pre-wrap">{typeof post.content === 'string' ? post.content : JSON.stringify(post.content)}</p>
                                            
                                            <div className="pt-4 border-t border-gray-700 flex justify-end">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePublishNow(post); }}
                                                    disabled={isPublishing}
                                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white px-6 py-2 rounded-lg"
                                                >
                                                    {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                    <span>{isPublishing ? publishStep : 'Publish Now'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}