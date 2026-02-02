import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Settings as SettingsIcon, LogOut, Menu, X, CheckCircle, FileCheck, Linkedin, Instagram, MessageCircle } from 'lucide-react';
import { auth } from '../firebase';
import { appVersion } from '../version'; // Importa a versão gerada pelo script
import InstallPWA from './InstallPWA';

export default function Layout() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const handleLogout = () => {
        auth.signOut();
        navigate('/login');
    };

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard', group: 'main' },
        { path: '/approvals', icon: CheckSquare, label: 'Approvals', group: 'main' },
        { path: '/approved', icon: FileCheck, label: 'Approved', group: 'main' },
        { path: '/published', icon: CheckCircle, label: 'Published', group: 'main' },


        { path: '/repost', icon: MessageCircle, label: 'AI Assistant', group: 'main' },
        { type: 'divider' },

        { path: '/linkedin', icon: Linkedin, label: 'LinkedIn', group: 'social' },
        { path: '/engagement', icon: CheckSquare, label: 'Engagement Hub', group: 'social' },
        { path: '/instagram', icon: Instagram, label: 'Instagram', group: 'social' },

        { type: 'divider' },

        { path: '/settings', icon: SettingsIcon, label: 'Settings', group: 'system' },
    ];

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4 z-50">
                <div className="flex items-center gap-2">
                    <img src="/pwa-192x192.png" alt="Logo" className="w-8 h-8 rounded-lg" />
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        AutoManager
                    </h1>
                </div>
                <button onClick={toggleSidebar} className="text-gray-400 hover:text-white">
                    {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed md:static inset-y-0 left-0 z-50 w-64 bg-gray-800/95 md:bg-gray-800/50 backdrop-blur-md border-r border-gray-700 flex flex-col transition-transform duration-300 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="p-6 border-b border-gray-700 hidden md:flex items-center gap-3">
                    <img src="/pwa-192x192.png" alt="Logo" className="w-8 h-8 rounded-lg" />
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        AutoManager
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-1 mt-16 md:mt-0 overflow-y-auto">
                    {navItems.map((item, index) => {
                        if (item.type === 'divider') {
                            return <div key={index} className="h-px bg-gray-700 my-4 mx-2" />;
                        }

                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsSidebarOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                    }`
                                }
                            >
                                <item.icon className="w-5 h-5" />
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-700">
                    <button
                        onClick={handleLogout}
                        className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Sign Out</span>
                    </button>

                    {/* EXIBIÇÃO DA VERSÃO */}
                    <div className="mt-4 text-center text-xs text-gray-600 font-mono">
                        v{appVersion || 'DEV'}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8 pt-20 md:pt-8">
                <div className="max-w-6xl mx-auto">
                    <Outlet />
                </div>
            </main>
            <InstallPWA />
        </div>
    );
}