import React from 'react';
import { UserProfile } from '../types';

interface HeaderProps {
    user: UserProfile | null;
    onLogout: () => void;
    onProfileClick: () => void; // <--- NEW PROP
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, onProfileClick }) => {
    return (
        <header className="bg-white shadow-sm sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center py-4">
                    <div className="flex items-center space-x-2">
                        <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <h1 className="text-2xl font-bold text-slate-800">Provider Schedule Manager</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {user && (
                            <>
                                {/* --- NEW CLICKABLE PROFILE AREA --- */}
                                <button
                                    onClick={onProfileClick} // <--- CALL NEW HANDLER
                                    className="flex items-center gap-2 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <span className="text-sm text-slate-600">
                                        Welcome, <span className="font-semibold">{user.name}</span>
                                    </span>
                                    {user.role === 'administrator' && (
                                        <span className="px-2 py-0.5 text-xs font-semibold text-white bg-indigo-600 rounded-full">Admin</span>
                                    )}
                                </button>
                                {/* --- END NEW PROFILE AREA --- */}

                                <button
                                    onClick={onLogout}
                                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                                >
                                    Logout
                                </button>
                            </>
                        )}
                        <div className="text-sm text-slate-500 hidden sm:block">Powered by Gemini</div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;