import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Waves } from 'lucide-react';

const LoginPage = () => {
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const result = await window.patService?.autoLogin();
            if (!result) return;

            if (result.success) {
                console.log('Auto-login successful');
                navigate('/home');
            } else if (result.reason === 'no-token') {
                console.log('No saved SoundHaus PAT');
            } else {
                console.warn('Auto-login failed', result);
            }
        };

        void attemptPATLogin();
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const email = (document.getElementById('email') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;

        try {
            const result = await window.patService?.manualLogin(email, password);
            if (!result) {
                setError('Login service unavailable');
                setLoading(false);
                return;
            }

            if (result.success) {
                navigate('/home');
            } else {
                setError(result.reason || 'Login failed');
                setLoading(false);
            }
        } catch (err) {
            setError('Connection failed — is the server running?');
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center w-full h-screen bg-bg-primary p-6 relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px]
                            bg-accent/[0.04] rounded-full blur-[100px] pointer-events-none" />
            <div className="w-full max-w-sm animate-scale-in relative z-10">
                {/* Logo + Title */}
                <div className="flex flex-col items-center mb-8">
                    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-4
                                    shadow-[0_0_30px_rgba(167,199,231,0.08)]">
                        <Waves className="w-7 h-7 text-accent" />
                    </div>
                    <h1 className="text-2xl font-bold text-gradient mb-1">SoundHaus</h1>
                    <p className="text-sm text-text-secondary">Sign in to manage your projects</p>
                </div>

                {/* Form card */}
                <div className="glass-panel rounded-2xl p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Email
                            </label>
                            <input
                                type="text"
                                id="email"
                                name="email"
                                autoComplete="email"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/60 border border-border-default
                                           text-text-primary text-sm placeholder:text-text-tertiary
                                           focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none
                                           transition-all duration-200"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                autoComplete="current-password"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/60 border border-border-default
                                           text-text-primary text-sm placeholder:text-text-tertiary
                                           focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none
                                           transition-all duration-200"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error-soft text-error text-xs">
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 btn-brand px-4 py-2.5
                                       rounded-xl text-sm font-semibold transition-all duration-200
                                       disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <LogIn className="w-4 h-4" />
                            {loading ? 'Signing in…' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-text-tertiary mt-5">
                    Create an account at <span className="text-accent">soundhaus.dev</span>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
