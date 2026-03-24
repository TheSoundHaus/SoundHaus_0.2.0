import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Music2, LogIn } from 'lucide-react';

const SUPABASE_PUBLIC_URL = 'http://129.212.182.247:8000'.replace(/\/$/, '');

/* ── Decorative music-motif components ── */

/** Animated equalizer bars — 5 bars with staggered timing */
const EqualizerBars = ({ className = '' }: { className?: string }) => (
    <div className={`flex items-end gap-[3px] h-8 ${className}`}>
        {[0, 0.15, 0.3, 0.15, 0.4].map((delay, i) => (
            <div
                key={i}
                className="w-[3px] rounded-full bg-accent/30 origin-bottom animate-eq-bar"
                style={{
                    animationDelay: `${delay}s`,
                    height: '100%',
                }}
            />
        ))}
    </div>
);

/** Horizontal waveform SVG — scrolling sine-wave overlay */
const WaveformOverlay = () => (
    <div className="absolute bottom-0 left-0 right-0 h-24 overflow-hidden opacity-[0.06] pointer-events-none">
        <svg
            className="w-[200%] h-full"
            viewBox="0 0 1200 100"
            preserveAspectRatio="none"
            style={{ animation: 'waveform 8s linear infinite' }}
        >
            <path
                d="M0,50 C50,20 100,80 150,50 C200,20 250,80 300,50 C350,20 400,80 450,50 C500,20 550,80 600,50 C650,20 700,80 750,50 C800,20 850,80 900,50 C950,20 1000,80 1050,50 C1100,20 1150,80 1200,50"
                fill="none"
                stroke="#A7C7E7"
                strokeWidth="2"
            />
            <path
                d="M0,60 C40,35 80,85 120,60 C160,35 200,85 240,60 C280,35 320,85 360,60 C400,35 440,85 480,60 C520,35 560,85 600,60 C640,35 680,85 720,60 C760,35 800,85 840,60 C880,35 920,85 960,60 C1000,35 1040,85 1080,60 C1120,35 1160,85 1200,60"
                fill="none"
                stroke="#A7C7E7"
                strokeWidth="1.5"
            />
        </svg>
    </div>
);

/** Feature carousel — rotates brand messages */
const BrandCarousel = () => {
    const [active, setActive] = useState(0);
    const slides = [
        { title: 'Collaborate in Real Time', desc: 'Push and pull Ableton projects like code — asynchronous music production.' },
        { title: 'Version Every Session', desc: 'Never lose a take. Track every change across your entire project history.' },
        { title: 'Built for Producers', desc: 'Git-powered workflow designed specifically for Ableton Live.' },
    ];

    useEffect(() => {
        const timer = setInterval(() => setActive(i => (i + 1) % slides.length), 4000);
        return () => clearInterval(timer);
    }, [slides.length]);

    return (
        <div className="w-full max-w-xs mx-auto mt-6">
            <div className="relative h-[72px] overflow-hidden">
                {slides.map((s, i) => (
                    <div
                        key={i}
                        className={`absolute inset-0 flex flex-col items-center justify-center text-center transition-all duration-700
                            ${i === active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
                    >
                        <p className="text-xs font-semibold text-accent tracking-wide uppercase">{s.title}</p>
                        <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed px-2">{s.desc}</p>
                    </div>
                ))}
            </div>
            {/* Dots */}
            <div className="flex items-center justify-center gap-1.5 mt-1">
                {slides.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setActive(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 cursor-pointer
                            ${i === active ? 'bg-accent w-4' : 'bg-accent/25'}`}
                    />
                ))}
            </div>
        </div>
    );
};

const LoginPage = () => {
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);
    const [isAutoLogging, setIsAutoLogging] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        // Prevent running twice in development mode
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const token = await window.patService?.getSoundHausCredentials();
            if (!token) {
                console.log('No saved SoundHaus PAT');
                setIsAutoLogging(false);
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

                const credRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/desktop/credentials`, {
                    method: 'GET',
                    headers,
                });

                if (!credRes.ok) {
                    console.warn('Saved PAT is invalid/expired');
                    setIsAutoLogging(false);
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
                setIsAutoLogging(false);
            }
        };

        void attemptPATLogin();
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        const email = (document.getElementById('username') as HTMLInputElement).value
        const password = (document.getElementById('password') as HTMLInputElement).value
        
        try {
            const loginRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            
            if (!loginRes.ok) {
                setError('Invalid email or password')
                return
            }

            const loginData = await loginRes.json()
            const accessToken = loginData.session.access_token

            if(!accessToken) {
                setError('Authentication error — please try again')
                return;
            }

            const patRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/auth/tokens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ token_name: 'Gitea Token', expires_in_days: 90 }),
            })

            if(!patRes.ok) {
                const errorData = await patRes.json().catch(() => ({}));
                console.error('PAT creation failed with status:', patRes.status);
                console.error('Error response:', JSON.stringify(errorData, null, 2));
                setError('Failed to create session token')
                return;
            }

            const patData = await patRes.json();
            const token = patData.token;

            try {
                await window.patService?.setSoundHausCredentials(token);
            } catch (error) {
                console.error('Failed to configure git credentials:', error);
                setError('Failed to save credentials')
                return;
            }

            const credRes = await fetch(`${SUPABASE_PUBLIC_URL}/api/desktop/credentials`, {
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
            console.error('Error:', error)
            setError('Connection failed — is the server running?')
        }
    }

    /* ── Auto-login loading state ── */
    if (isAutoLogging) {
        return (
            <div className="flex items-center justify-center w-full h-screen bg-bg-primary relative overflow-hidden">
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse-glow" />
                        <Music2 className="relative w-12 h-12 text-accent animate-pulse" />
                    </div>
                    <EqualizerBars className="opacity-60" />
                    <div className="flex items-center gap-2 text-text-secondary text-sm">
                        <Loader2 className="w-4 h-4 animate-spin-slow" />
                        <span>Signing you in…</span>
                    </div>
                </div>
                <WaveformOverlay />
            </div>
        )
    }

    /* ── Login form ── */
    return (
        <div className="flex items-center justify-center w-full h-screen bg-bg-primary relative overflow-hidden">
            {/* Background glow orbs */}
            <div className="absolute top-1/4 -left-32 w-72 h-72 rounded-full bg-accent/[0.05] blur-3xl" />
            <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-accent/[0.04] blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-bg-tertiary/20 blur-3xl" />

            {/* Waveform bottom accent */}
            <WaveformOverlay />

            <div className="w-full max-w-sm mx-auto px-6 animate-scale-in relative z-10">
                {/* Logo + Branding */}
                <div className="text-center mb-8">
                    <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-border-glass mb-4
                                    bg-gradient-to-br from-bg-tertiary/80 to-bg-elevated/60 shadow-brand-glow">
                        <div className="absolute inset-0 rounded-2xl bg-accent/[0.06]" />
                        <Music2 className="relative w-8 h-8 text-accent" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-gradient">
                        SoundHaus
                    </h1>
                    <p className="text-sm text-text-tertiary mt-1">
                        Collaborative music production
                    </p>

                    {/* Equalizer bars under logo */}
                    <div className="flex justify-center mt-3">
                        <EqualizerBars />
                    </div>
                </div>

                {/* Login Card */}
                <div className="glass-panel-heavy rounded-2xl p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="username" className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Email
                            </label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                autoFocus
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-secondary/80 border border-border-default text-text-primary text-sm
                                           placeholder:text-text-tertiary
                                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50
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
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-secondary/80 border border-border-default text-text-primary text-sm
                                           placeholder:text-text-tertiary
                                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50
                                           transition-all duration-200"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="text-xs text-error bg-error-soft rounded-lg px-3 py-2 animate-slide-down">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                       btn-brand active:scale-[0.97]
                                       text-sm
                                       transition-all duration-200 cursor-pointer mt-2"
                        >
                            <LogIn className="w-4 h-4" />
                            Sign In
                        </button>
                    </form>
                </div>

                {/* Brand carousel */}
                <BrandCarousel />

                <p className="text-center text-xs text-text-tertiary mt-5">
                    Don't have an account?{' '}
                    <span className="text-accent/80 hover:text-accent cursor-pointer transition-colors">Sign up at soundhaus.app</span>
                </p>
            </div>
        </div>
    )
}

export default LoginPage;