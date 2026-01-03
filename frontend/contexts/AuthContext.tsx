import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '../types';

interface AuthContextType {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    login: (credential: string) => Promise<void>;
    loginWithEmail: (email: string, password: string) => Promise<void>;
    signUp: (name: string, email: string, password: string, providerId: string) => Promise<void>; // <--- UPDATED SIGNATURE
    resetPassword: (email: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    useEffect(() => {
        // Check for stored user session on mount
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (error) {
                console.error('Failed to parse stored user:', error);
                localStorage.removeItem('user');
            }
        }
        setIsAuthLoading(false);
    }, []);

    const login = async (credential: string) => {
        try {
            // Decode the JWT token to get user information
            const base64Url = credential.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );

            const payload = JSON.parse(jsonPayload);
            const email = payload.email.toLowerCase().trim();

            // Check for existing user to ensure persistent ID (Google login logic)
            const storedUsers = localStorage.getItem('users');
            const users = storedUsers ? JSON.parse(storedUsers) : [];
            const existingUser = users.find((u: any) => u.email === email);

            let providerId: string;
            let userName = payload.name;
            if (existingUser) {
                // Use the existing ID if the account is found
                providerId = existingUser.id;
                userName = existingUser.name; // Use stored name for consistency
            } else {
                // If the user logs in via Google for the first time, assign P79 as default provider ID
                providerId = 'P79';
                const newUser = {
                    id: providerId,
                    name: payload.name,
                    email: email,
                    password: '', // No password for Google login
                    role: 'provider',
                    picture: payload.picture,
                    createdAt: new Date().toISOString()
                };
                users.push(newUser);
                localStorage.setItem('users', JSON.stringify(users));
            }


            // Create user profile
            const userProfile: UserProfile = {
                id: providerId, // Use the persistent ID
                name: userName,
                email: email,
                role: 'provider',
                picture: payload.picture
            };

            setUser(userProfile);
            localStorage.setItem('user', JSON.stringify(userProfile));
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    };

    const loginWithEmail = async (email: string, password: string) => {
        try {
            // Get stored users from localStorage
            const storedUsers = localStorage.getItem('users');
            const users = storedUsers ? JSON.parse(storedUsers) : [];
            const trimmedEmail = email.toLowerCase().trim();


            // Find user with matching email
            const user = users.find((u: any) => u.email === trimmedEmail);

            if (!user) {
                throw new Error('No account found with this email address.');
            }

            // Verify password (in production, use proper hashing)
            if (user.password !== password) {
                throw new Error('Incorrect password. Please try again.');
            }

            // Create user profile (exclude password)
            const userProfile: UserProfile = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                picture: user.picture
            };

            setUser(userProfile);
            localStorage.setItem('user', JSON.stringify(userProfile));
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    };

    const signUp = async (name: string, email: string, password: string, providerId: string) => { // <--- ADDED providerId
        try {
            // Get stored users from localStorage
            const storedUsers = localStorage.getItem('users');
            const users = storedUsers ? JSON.parse(storedUsers) : [];

            const trimmedEmail = email.toLowerCase().trim();
            const trimmedProviderId = providerId.toUpperCase().trim(); // Standardize ID format

            // Check if user email already exists
            const existingEmailUser = users.find((u: any) => u.email === trimmedEmail);
            if (existingEmailUser) {
                throw new Error('An account with this email already exists. Please sign in.');
            }

            // Check if user-provided Provider ID already exists <--- NEW VALIDATION
            const existingIdUser = users.find((u: any) => u.id === trimmedProviderId);
            if (existingIdUser) {
                throw new Error(`Provider ID "${trimmedProviderId}" is already taken. Please choose a different ID.`);
            }

            // Validate inputs
            if (name.trim().length < 2) {
                throw new Error('Name must be at least 2 characters long.');
            }

            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters long.');
            }

            if (trimmedProviderId.length < 2) {
                throw new Error('Provider ID must be at least 2 characters long.');
            }


            // Create new user, using the ID provided by the user
            const newUser = {
                id: trimmedProviderId, // <--- USE USER-PROVIDED ID
                name: name.trim(),
                email: trimmedEmail,
                password: password, // In production, hash this!
                role: 'provider',
                picture: undefined,
                createdAt: new Date().toISOString()
            };

            // Save to localStorage
            users.push(newUser);
            localStorage.setItem('users', JSON.stringify(users));

            // Create user profile (exclude password)
            const userProfile: UserProfile = {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                picture: newUser.picture
            };

            setUser(userProfile);
            localStorage.setItem('user', JSON.stringify(userProfile));
        } catch (error) {
            console.error('Sign up failed:', error);
            throw error;
        }
    };

    const resetPassword = async (email: string) => {
        try {
            // Get stored users from localStorage
            const storedUsers = localStorage.getItem('users');
            const users = storedUsers ? JSON.parse(storedUsers) : [];

            // Find user with matching email
            const user = users.find((u: any) => u.email === email.toLowerCase().trim());

            if (!user) {
                throw new Error('No account found with this email address.');
            }

            // Simulate sending email
            console.log(`Password reset email would be sent to: ${email}`);

            return Promise.resolve();
        } catch (error) {
            console.error('Password reset failed:', error);
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
    };

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isAuthLoading,
        login,
        loginWithEmail,
        signUp,
        resetPassword,
        logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};