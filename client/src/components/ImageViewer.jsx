import React, { useState, useEffect } from 'react';
import { X, Share2, ZoomIn, ZoomOut } from 'lucide-react';

export default function ImageViewer({ src, alt, isOpen, onClose }) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [startDist, setStartDist] = useState(0);
    const [startScale, setStartScale] = useState(1);
    const isDragging = React.useRef(false);
    const lastPos = React.useRef({ x: 0, y: 0 });

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen]);

    // Update cursor based on zoom
    const cursorStyle = scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default';

    if (!isOpen) return null;

    const handleShare = async () => {
        if (!navigator.share) {
            navigator.clipboard.writeText(src);
            alert('Link da imagem copiado!');
            return;
        }

        try {
            // Tenta buscar a imagem
            const response = await fetch(src);
            const blob = await response.blob();
            const fileName = (alt || 'imagem').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
            const file = new File([blob], fileName, { type: blob.type });

            const shareData = {
                files: [file],
                title: alt || 'Imagem',
                text: 'Confira este post!'
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                // Fallback apenas URL
                await navigator.share({
                    title: alt || 'Imagem',
                    text: 'Confira este post!',
                    url: src
                });
            }
        } catch (error) {
            console.log('Error sharing:', error);
            // Fallback em caso de erro no fetch/blob
            try {
                await navigator.share({
                    title: alt || 'Imagem',
                    text: 'Confira este post!',
                    url: src
                });
            } catch (e) {
                console.error("Share failed", e);
            }
        }
    };

    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            setStartDist(dist);
            setStartScale(scale);
        } else if (e.touches.length === 1 && scale > 1) {
            isDragging.current = true;
            lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            if (startDist > 0) {
                const newScale = startScale * (dist / startDist);
                setScale(Math.min(Math.max(1, newScale), 5)); // Limit zoom 1x to 5x
            }
        } else if (e.touches.length === 1 && scale > 1 && isDragging.current) {
            const deltaX = e.touches[0].clientX - lastPos.current.x;
            const deltaY = e.touches[0].clientY - lastPos.current.y;

            setPosition(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
            lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };

    const handleTouchEnd = () => {
        isDragging.current = false;
    };

    // Mouse handlers
    const handleMouseDown = (e) => {
        if (scale > 1) {
            e.preventDefault();
            isDragging.current = true;
            lastPos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging.current && scale > 1) {
            e.preventDefault();
            const deltaX = e.clientX - lastPos.current.x;
            const deltaY = e.clientY - lastPos.current.y;

            setPosition(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
            lastPos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    const zoomIn = (e) => { e.stopPropagation(); setScale(s => Math.min(s + 0.5, 5)); };
    const zoomOut = (e) => {
        e.stopPropagation();
        setScale(s => {
            const newScale = Math.max(1, s - 0.5);
            if (newScale === 1) setPosition({ x: 0, y: 0 }); // Reset position on full zoom out
            return newScale;
        });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-fadeIn touch-none">
            {/* Header / Controls */}
            <div className="absolute top-0 left-0 right-0 flex justify-between items-center p-4 z-50 bg-gradient-to-b from-black/80 to-transparent">
                <button onClick={onClose} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 backdrop-blur transition-all">
                    <X className="w-6 h-6" />
                </button>
                <div className="flex gap-4">
                    <button onClick={zoomOut} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 backdrop-blur transition-all">
                        <ZoomOut className="w-5 h-5" />
                    </button>
                    <button onClick={zoomIn} className="p-3 bg-white/10 rounded-full text-white hover:bg-white/20 backdrop-blur transition-all">
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <button onClick={handleShare} className="p-3 bg-blue-600/80 rounded-full text-white hover:bg-blue-600 backdrop-blur transition-all">
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Image Container */}
            <div
                className="flex-1 flex items-center justify-center overflow-hidden w-full h-full"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={onClose} // Fecha ao clicar fora/na imagem (fácil fechar)
            >
                <img
                    src={src}
                    alt={alt}
                    className="max-w-full max-h-full object-contain transition-transform duration-75 ease-out will-change-transform"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        cursor: cursorStyle
                    }}
                    onClick={(e) => e.stopPropagation()} // Evita fechar ao clicar na imagem
                />
            </div>
            <div className="absolute bottom-10 left-0 right-0 text-center text-gray-500 text-xs pointer-events-none">
                Pinch to Zoom • Share enabled
            </div>
        </div>
    );
}
