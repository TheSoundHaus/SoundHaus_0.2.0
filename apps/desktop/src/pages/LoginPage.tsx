import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Waves } from 'lucide-react';

const SUPABASE_PUBLIC_URL = (import.meta.env.VITE_SUPABASE_PUBLIC_URL as string).replace(/\/$/, '');

const LoginPage = () => {
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const token = await window.patService?.getSoundHausCredentials();
            if (!token) {
                console.log('No saved SoundHaus PAT');
                return;
            }

            const existingGiteaToken = await window.patService?.getGiteaCredentials();
            console.log('Attempting PAT auto-login...');

            try {
                const credUrl = `${SUPABASE_PUBLIC_URL}/api/desktop/credentials`;
                const headers: Record<string, string> = { Authorization: `token ${token}` };
                if (existingGiteaToken) {
                    headers['X-Cached-Gitea-Token'] = existingGiteaToken;
                }

                const credRes = await fetch(credUrl, { method: 'GET', headers });

                if (!credRes.ok) {
                    console.warn('Saved PAT is invalid/expired');
                    return;
                }

                const credData = await credRes.json();

                if (!existingGiteaToken || existingGiteaToken !== credData.token) {
                    console.log('Saving new Gitea token');
                    await window.patService?.setGiteaCredentials(credData.token);
                } else {
                    console.log('Gitea token validated and reused');
                }

                if (credData?.gitea_url) {
                    await window.patService?.setAllowedCloneRemote(credData.gitea_url);
                }

                console.log('Auto-login successful');
                navigate('/home');
            } catch (err) {
                console.warn('Auto-login failed', err);
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
            const loginRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!loginRes.ok) {
                setError('Invalid email or password');
                setLoading(false);
                return;
            }

            const loginData = await loginRes.json();
            const accessToken = loginData.session.access_token;

            if (!accessToken) {
                setError('No access token returned');
                setLoading(false);
                return;
            }

            const patRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/auth/tokens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ token_name: 'Gitea Token', expires_in_days: 90 }),
            });

            if (!patRes.ok) {
                setError('Could not create session token');
                setLoading(false);
                return;
            }

            const patData = await patRes.json();
            const token = patData.token;

            try {
                await window.patService?.setSoundHausCredentials(token);
            } catch (err) {
                setError('Failed to store credentials');
                setLoading(false);
                return;
            }

            const credRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/desktop/credentials`, {
                method: 'GET',
                headers: { Authorization: `token ${token}` }
            });

            if (credRes.ok) {
                const credData = await credRes.json();
                if (credData?.token) await window.patService?.setGiteaCredentials(credData.token);
                if (credData?.gitea_url) await window.patService?.setAllowedCloneRemote(credData.gitea_url);
            }

            navigate('/home');
        } catch (err) {
            setError('Connection failed — is the server running?');
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center w-full h-screen bg-bg-primary p-6">
            <div className="w-full max-w-sm animate-scale-in">
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
