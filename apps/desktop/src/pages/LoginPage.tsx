import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Music, AlertCircle } from 'lucide-react';

const LoginPage = () => {
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        // Prevent running twice in development mode
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const token = await window.patService?.getSoundHausCredentials();
            if (!token) {
                console.log('No saved SoundHaus PAT');
                setLoading(false);
                return;
            }

            // Check if we already have a Gitea token
            const existingGiteaToken = await window.patService?.getGiteaCredentials();

            console.log('Attempting PAT auto-login...');

            try {
                const headers: Record<string, string> = { Authorization: `token ${token}` };
                if (existingGiteaToken) {
                    headers['X-Cached-Gitea-Token'] = existingGiteaToken;
                }

                const credRes = await fetch('http://localhost:8000/api/desktop/credentials', {
                    method: 'GET',
                    headers,
                });

                if (!credRes.ok) {
                    console.warn('Saved PAT is invalid/expired');
                    setLoading(false);
                    return;
                }

                const credData = await credRes.json();

                // Only save if we don't have a token, or if the returned token is different
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
                setLoading(false);
            }
        };

        void attemptPATLogin();
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const email = (document.getElementById('username') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;

        try {
            const loginRes = await fetch('http://localhost:8000/api/auth/login', {
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
                setError('Authentication failed. Please try again.');
                setLoading(false);
                return;
            }

            const patRes = await fetch('http://localhost:8000/api/auth/tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ token_name: 'Gitea Token', expires_in_days: 90 }),
            });

            if (!patRes.ok) {
                setError('Failed to create session token');
                setLoading(false);
                return;
            }

            const patData = await patRes.json();
            const token = patData.token;

            try {
                await window.patService?.setSoundHausCredentials(token);
            } catch (error) {
                console.error('Failed to configure git credentials:', error);
                setError('Failed to save credentials');
                setLoading(false);
                return;
            }

            const credRes = await fetch('http://localhost:8000/api/desktop/credentials', {
                method: 'GET',
                headers: { Authorization: `token ${token}` }
            });

            if (credRes.ok) {
                const credData = await credRes.json();
                const giteaToken = credData?.token;

                if (giteaToken) {
                    await window.patService?.setGiteaCredentials(giteaToken);
                }

                if (credData?.gitea_url) {
                    await window.patService?.setAllowedCloneRemote(credData.gitea_url);
                }
            }

            navigate('/home');

        } catch (error) {
            console.error('Error:', error);
            setError('Connection failed. Is the server running?');
            setLoading(false);
        }
    };

    // Show subtle loading state during auto-login attempt
    if (loading && !error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                    <div className="w-12 h-12 rounded-xl bg-glass-blue/10 flex items-center justify-center">
                        <Music className="w-6 h-6 text-glass-blue" />
                    </div>
                    <p className="text-sm text-muted animate-pulse">Connecting...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-8">
            <div className="card-glass w-full max-w-sm animate-scale-in">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-xl bg-glass-blue/10 flex items-center justify-center mb-4">
                        <Music className="w-6 h-6 text-glass-blue" />
                    </div>
                    <h1 className="text-xl font-bold text-soft-white text-glow">SoundHaus</h1>
                    <p className="text-sm text-muted mt-1">Sign in to your workspace</p>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 rounded-md flex items-center gap-2 text-sm"
                         style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#EF4444' }}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="label" htmlFor="username">Email</label>
                        <input
                            className="input"
                            type="text"
                            id="username"
                            name="username"
                            placeholder="you@example.com"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="label" htmlFor="password">Password</label>
                        <input
                            className="input"
                            type="password"
                            id="password"
                            name="password"
                            placeholder="Enter your password"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary mt-2" disabled={loading}>
                        {loading ? (
                            <span className="animate-pulse">Signing in...</span>
                        ) : (
                            <>
                                <LogIn className="w-4 h-4" />
                                Sign In
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;