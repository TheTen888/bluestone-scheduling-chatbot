
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';

// Error Boundary Component
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('React Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ 
                    padding: '20px', 
                    margin: '20px', 
                    border: '2px solid red', 
                    borderRadius: '8px',
                    backgroundColor: '#fee' 
                }}>
                    <h1 style={{ color: 'red' }}>Something went wrong.</h1>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>
                        {this.state.error?.toString()}
                        <br />
                        {this.state.error?.stack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}

console.log('Index.tsx loading...');

const rootElement = document.getElementById('root');
if (!rootElement) {
    console.error('Root element not found!');
    throw new Error("Could not find root element to mount to");
}

console.log('Root element found, creating React root...');

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <ErrorBoundary>
            <AuthProvider>
                <App />
            </AuthProvider>
        </ErrorBoundary>
    </React.StrictMode>
);

console.log('React app rendered');