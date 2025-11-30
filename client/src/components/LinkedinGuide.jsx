import React from 'react';
import { AlertTriangle, Globe, Copy, CheckCircle } from 'lucide-react';

export default function LinkedinGuide() {
    const origin = window.location.origin;

    return (
        <div className="space-y-6 animate-fadeIn max-w-4xl mx-auto">
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-6 rounded-xl">
                <h3 className="text-xl font-bold text-yellow-400 flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-6 h-6" />
                    Atenção: Vercel Free Plan
                </h3>
                <p className="text-gray-300">
                    O plano gratuito da Vercel não permite Cron Jobs rodando a cada minuto (limite de 1/dia).<br/>
                    Para que seu agendamento funcione em tempo real, você precisa configurar um <strong>gatilho externo gratuito</strong>.
                </p>
            </div>

            <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-6">
                <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                    <Globe className="w-5 h-5" /> Passo a Passo (cron-job.org)
                </h3>
                <ol className="space-y-4 text-gray-300 ml-4 list-decimal pl-4">
                    <li>Crie uma conta gratuita em <a href="https://cron-job.org/en/" target="_blank" rel="noreferrer" className="text-blue-400 underline">cron-job.org</a>.</li>
                    <li>Clique em <strong>"Create Cronjob"</strong>.</li>
                    <li>
                        <div className="mb-2">No campo <strong>URL</strong>, copie e cole exatamente este endereço:</div>
                        <div className="bg-black/30 p-3 rounded flex items-center justify-between font-mono text-sm text-yellow-200 border border-gray-600">
                            <span>{origin}/api/cron</span>
                            <button 
                                onClick={() => navigator.clipboard.writeText(`${origin}/api/cron`)} 
                                className="text-gray-400 hover:text-white"
                                title="Copiar URL"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </li>
                    <li>Em <strong>"Schedule"</strong>, selecione <strong>"Every minute"</strong>.</li>
                    <li>Clique em <strong>Create</strong>.</li>
                </ol>
                <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
                    <p className="text-sm text-gray-300">
                        Pronto! O serviço externo vai "acordar" seu servidor a cada minuto para checar se há posts para criar ou publicar.
                    </p>
                </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur p-6 rounded-xl border border-gray-700 space-y-4">
                <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                    <span className="bg-blue-500/20 w-8 h-8 flex items-center justify-center rounded-full text-sm">1</span>
                    Configuração do App (LinkedIn Developers)
                </h3>
                <ul className="space-y-3 text-gray-300 ml-4 list-disc pl-4">
                    <li>Acesse o <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer" className="text-blue-400 underline">LinkedIn Developer Portal</a>.</li>
                    <li>Crie um novo App e associe à sua Página (pessoal ou empresa).</li>
                    <li><strong>CRUCIAL:</strong> Vá na aba <strong>Products</strong> e adicione estes dois produtos:
                        <ul className="list-circle ml-6 mt-2 text-sm text-gray-400">
                            <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-green-500"/> <strong>Share on LinkedIn</strong> (Para postar)</li>
                            <li className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-green-500"/> <strong>Sign In with LinkedIn using OpenID Connect</strong> (Para logar)</li>
                        </ul>
                    </li>
                    <li>Vá na aba <strong>Auth</strong> e adicione a URL de Redirecionamento exata:
                        <div className="bg-black/30 p-2 rounded mt-1 font-mono text-xs text-yellow-200">
                            {origin}/auth/linkedin/callback
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
}