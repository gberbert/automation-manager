import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';

export default function InstallPWA() {
    const [supportsPWA, setSupportsPWA] = useState(false);
    const [promptInstall, setPromptInstall] = useState(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault();
            setSupportsPWA(true);
            setPromptInstall(e);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Check for iOS
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

        if (ios && !isStandalone) {
            setIsIOS(true);
        }

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const onClick = (evt) => {
        evt.preventDefault();
        if (!promptInstall) {
            return;
        }
        promptInstall.prompt();
    };

    if (!supportsPWA && !isIOS) {
        return null;
    }

    return (
        <>
            {/* Android / Desktop Install Button */}
            {supportsPWA && (
                <button
                    className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg flex items-center space-x-2 transition-all transform hover:scale-105"
                    id="setup_button"
                    aria-label="Install app"
                    title="Install App"
                    onClick={onClick}
                >
                    <Download className="w-5 h-5" />
                    <span className="font-medium">Instalar App</span>
                </button>
            )}

            {/* iOS Install Button (Triggers Instructions) */}
            {isIOS && (
                <button
                    className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg flex items-center space-x-2 transition-all transform hover:scale-105"
                    onClick={() => setShowIOSInstructions(true)}
                >
                    <Download className="w-5 h-5" />
                    <span className="font-medium">Instalar App</span>
                </button>
            )}

            {/* iOS Instructions Modal */}
            {showIOSInstructions && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative animate-slideUp md:animate-fadeIn">
                        <button
                            onClick={() => setShowIOSInstructions(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-white mb-2">Instalar no iPhone</h3>
                            <p className="text-gray-400 text-sm">Siga os passos abaixo para adicionar à sua tela inicial:</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center space-x-4 text-gray-300">
                                <div className="bg-gray-800 p-2 rounded-lg">
                                    <Share className="w-6 h-6 text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm">1. Toque no botão <span className="font-bold text-white">Compartilhar</span> na barra inferior do navegador.</p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-4 text-gray-300">
                                <div className="bg-gray-800 p-2 rounded-lg">
                                    <PlusSquare className="w-6 h-6 text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm">2. Role para baixo e selecione <span className="font-bold text-white">Adicionar à Tela de Início</span>.</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 text-center">
                            <button
                                onClick={() => setShowIOSInstructions(false)}
                                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                            >
                                Entendi, fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
