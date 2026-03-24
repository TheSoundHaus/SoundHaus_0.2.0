import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Music, AlertCircle } from 'lucide-react';

const LoginPage = () => {
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const token = await window.patService?.getSoundHausCredentials();
            if (!token) {
                console.log('No saved SoundHaus PAT');
                setLoading(false);
                return;
            }

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
            // Step 1: Login to get access token
            const loginRes = await fetch('http://localhost:8000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
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

            // Step 2: Create a PAT
            const patRes = await fetch('http://localhost:8000/api/auth/tokens', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ token_name: 'Gitea Token', expires_in_days: 90 }),
            });

            if (!patRes.ok) {
                setError('Failed to create session token');
                setLoading(false);
                return;
            }

            const patData = await patRes.json();
            const token = patData.token;

            // Step 3: Save credentials
            try {
                await window.patService?.setSoundHausCredentials(token);
            } catch (credError) {
                console.error('Failed to configure git credentials:', credError);
                setError('Failed to save credentials');
                setLoading(false);
                return;
            }

            // Step 4: Get Gitea credentials
            const credRes = await fetch('http://localhost:8000/api/desktop/credentials', {
                method: 'GET',
                headers: { Authorization: `token ${token}` },
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
        } catch (err) {
            console.error('Error:', err);
            setError('Connection failed. Is the server running?');
            setLoading(false);
        }
    };

    /* -- Waveform loading state during auto-login -- */
    if (loading && !error) {
        return (
            <div className="page-centered">
                <div className="flex flex-col items-center gap-5 animate-fade-in">
                    <div className="waveform-loader">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <span key={i} />
                        ))}
                    </div>
                    <p
                        className="text-sm animate-pulse"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Connecting to SoundHaus...
                    </p>
                </div>
            </div>
        );
    }

    /* -- Login form -- */
    return (
        <div className="page-centered">
            <div className="w-full max-w-[380px] animate-scale-in">
                {/* Brand header */}
                <div className="flex flex-col items-center mb-10">
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                        style={{ background: 'var(--accent-bg)' }}
                    >
                        <Music className="w-8 h-8" style={{ color: 'var(--accent)' }} />
                    </div>
                    <h1
                        className="text-[28px] font-bold tracking-tight"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Sound<span className="text-brand">Haus</span>
                    </h1>
                    <p
                        className="text-[15px] mt-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Collaborative Music Production
                    </p>
                </div>

                {/* Login card */}
                <div className="card">
                    <h2
                        className="text-lg font-semibold mb-1"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Welcome back
                    </h2>
                    <p
                        className="text-sm mb-6"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Sign in to continue your session
                    </p>

                    {error && (
                        <div className="error-banner mb-5">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div>
                            <label className="label" htmlFor="username">
                                Email
                            </label>
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
                            <label className="label" htmlFor="password">
                                Password
                            </label>
                            <input
                                className="input"
                                type="password"
                                id="password"
                                name="password"
                                placeholder="Enter your password"
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary w-full mt-1"
                            disabled={loading}
                        >
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
        </div>
    );
};

export default LoginPage;
