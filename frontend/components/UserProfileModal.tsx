// src/components/UserProfileModal.tsx
import React from 'react';
import { UserProfile } from '../types';

interface UserProfileModalProps {
    user: UserProfile;
    onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose }) => {
    return (
        // Modal Overlay
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4" onClick={onClose}>
            {/* Modal Content */}
            <div
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-auto transform transition-all"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
                <div className="flex justify-between items-start mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-slate-800">Your Profile</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                        aria-label="Close"
                    >&times;</button>
                </div>

                <div className="space-y-3">
                    <div className="p-3 bg-slate-50 rounded-md">
                        <p className="text-sm font-medium text-slate-500">Name</p>
                        <p className="text-lg font-semibold text-slate-700">{user.name}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-md">
                        <p className="text-sm font-medium text-slate-500">Email</p>
                        <p className="text-lg font-semibold text-slate-700">{user.email}</p>
                    </div>

                    <div className="p-3 bg-indigo-50 rounded-md border border-indigo-200">
                        <p className="text-sm font-medium text-indigo-700">Provider ID</p>
                        <p className="text-xl font-extrabold text-indigo-900">{user.id}</p>
                    </div>

                    {user.role === 'administrator' && (
                        <div className="p-3 bg-red-50 rounded-md border border-red-200">
                            <p className="text-sm font-medium text-red-600">Role</p>
                            <p className="text-lg font-semibold text-red-700">Administrator</p>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserProfileModal;