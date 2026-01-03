import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GoogleIcon, EmailIcon, LockIcon } from './icons';

declare global {
    interface Window {
        google: any;
    }
}

type AuthMode = 'signin' | 'signup' | 'forgot-password';

const AuthPage: React.FC = () => {
    const { login, loginWithEmail, signUp, resetPassword } = useAuth();
    const [authMode, setAuthMode] = useState<AuthMode>('signin');
    const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [providerId, setProviderId] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Initialize Google Sign-In
        const initializeGoogleSignIn = () => {
            if (window.google) {
                window.google.accounts.id.initialize({
                    client_id: '478917916703-3hqsffl6kdjnu7r61i9e33hh5mjrmq52.apps.googleusercontent.com', // Replace with actual Google Client ID
                    callback: handleGoogleResponse,
                });

                window.google.accounts.id.renderButton(
                    document.getElementById('googleSignInButton'),
                    {
                        theme: 'outline',
                        size: 'large',
                        width: '100%',
                        text: 'continue_with',
                    }
                );

                setIsGoogleLoaded(true);
            }
        };

        // Wait for Google script to load
        if (window.google) {
            initializeGoogleSignIn();
        } else {
            const checkGoogle = setInterval(() => {
                if (window.google) {
                    initializeGoogleSignIn();
                    clearInterval(checkGoogle);
                }
            }, 100);

            return () => clearInterval(checkGoogle);
        }
    }, []);

    const handleGoogleResponse = async (response: any) => {
        try {
            setIsLoading(true);
            setError('');
            await login(response.credential);
        } catch (err) {
            setError('Failed to sign in with Google. Please try again.');
            console.error('Google sign-in error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            if (authMode === 'signin') {
                await loginWithEmail(email, password);
            } else if (authMode === 'signup') {
                // Validate password match
                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match.');
                }
                // Call signUp with the new providerId
                await signUp(name, email, password, providerId);

                // Logic after successful sign up
                setSuccess('Account successfully created! Please sign in below.');
                switchMode('signin');
                setEmail(email); // Keep email pre-filled
                setPassword('');
                setConfirmPassword('');
                setName('');
                setProviderId(''); // Clear provider ID field
            } else if (authMode === 'forgot-password') {
                await resetPassword(email);
                setSuccess('Password reset instructions have been sent to your email.');
                setEmail('');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An error occurred. Please try again.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const switchMode = (mode: AuthMode) => {
        setAuthMode(mode);
        setError('');
        setSuccess('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        setProviderId(''); // Added: Clear providerId on mode switch
    };

    const getTitle = () => {
        switch (authMode) {
            case 'signin':
                return 'Welcome Back';
            case 'signup':
                return 'Create Account';
            case 'forgot-password':
                return 'Reset Password';
        }
    };

    const getSubtitle = () => {
        switch (authMode) {
            case 'signin':
                return 'Sign in to access your schedule manager';
            case 'signup':
                return 'Create a new account to get started';
            case 'forgot-password':
                return 'Enter your email to reset your password';
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8">
                {/* Header */}
                <div className="text-center">
                    <div className="flex justify-center mb-4">
                        <svg className="w-16 h-16 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-800 mb-2">{getTitle()}</h2>
                    <p className="text-slate-600">{getSubtitle()}</p>
                </div>

                {/* Auth Card */}
                <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
                    {/* Google Sign-In Button - Only show for sign in */}
                    {authMode === 'signin' && (
                        <>
                            <div>
                                <div id="googleSignInButton" className="w-full"></div>
                                {!isGoogleLoaded && (
                                    <div className="flex items-center justify-center w-full h-12 border-2 border-slate-200 rounded-lg">
                                        <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                                    </div>
                                )}
                            </div>

                            {/* Divider */}
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200"></div>
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-4 bg-white text-slate-500">Or continue with email</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Email/Password Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Name field - only for sign up */}
                        {authMode === 'signup' && (
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                                    Full Name
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Provider ID field - only for sign up */}
                        {authMode === 'signup' && (
                            <div>
                                <label htmlFor="providerId" className="block text-sm font-medium text-slate-700 mb-1">
                                    Provider ID / Number
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                        </svg>
                                    </div>
                                    <input
                                        id="providerId"
                                        name="providerId"
                                        type="text"
                                        required
                                        value={providerId}
                                        onChange={(e) => setProviderId(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="P12345"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                                Email address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <EmailIcon />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        {/* Password field - hide for forgot password */}
                        {authMode !== 'forgot-password' && (
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                                    Password
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <LockIcon />
                                    </div>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="••••••••"
                                        minLength={6}
                                    />
                                </div>
                                {authMode === 'signup' && (
                                    <p className="mt-1 text-xs text-slate-500">Must be at least 6 characters</p>
                                )}
                            </div>
                        )}

                        {/* Confirm Password field - only for sign up */}
                        {authMode === 'signup' && (
                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <LockIcon />
                                    </div>
                                    <input
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="••••••••"
                                        minLength={6}
                                    />
                                </div>
                            </div>
                        )}

                        {success && (
                            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                                {success}
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? (
                                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                            ) : authMode === 'signin' ? (
                                'Sign in'
                            ) : authMode === 'signup' ? (
                                'Create account'
                            ) : (
                                'Send reset link'
                            )}
                        </button>
                    </form>

                    {/* Footer Links */}
                    <div className="text-center space-y-2">
                        {authMode === 'signin' && (
                            <>
                                <button
                                    onClick={() => switchMode('forgot-password')}
                                    className="text-sm text-indigo-600 hover:text-indigo-800 block w-full"
                                >
                                    Forgot your password?
                                </button>
                                <p className="text-sm text-slate-600">
                                    Don't have an account?{' '}
                                    <button
                                        onClick={() => switchMode('signup')}
                                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                        Sign up
                                    </button>
                                </p>
                            </>
                        )}
                        {authMode === 'signup' && (
                            <p className="text-sm text-slate-600">
                                Already have an account?{' '}
                                <button
                                    onClick={() => switchMode('signin')}
                                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    Sign in
                                </button>
                            </p>
                        )}
                        {authMode === 'forgot-password' && (
                            <p className="text-sm text-slate-600">
                                Remember your password?{' '}
                                <button
                                    onClick={() => switchMode('signin')}
                                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    Sign in
                                </button>
                            </p>
                        )}
                    </div>
                </div>

                {/* Security Notice */}
                <p className="text-center text-xs text-slate-500">
                    By signing in, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
};

export default AuthPage;