import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Waves } from 'lucide-react';
import WaveformSpinner from '../components/WaveformSpinner';

const AUTO_LOGIN_PHRASES = [
    'Tuning the instruments…',
    'Finding your groove…',
    'Loading your sessions…',
    'Warming up the amps…',
    'Syncing with the studio…',
    'Checking for new tracks…',
    'Connecting to the cloud…',
    'Almost ready to rock…',
    'Setting the tempo…',
    'Mixing it all together…',
];

const LoginPage = () => {
    console.log('[SoundHaus] LoginPage: rendering')
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [autoLoginPending, setAutoLoginPending] = useState(true);
    const [phraseIndex, setPhraseIndex] = useState(() =>
        Math.floor(Math.random() * AUTO_LOGIN_PHRASES.length)
    );

    // Rotate phrases while auto-login is pending
    useEffect(() => {
        if (!autoLoginPending) return;
        const id = setInterval(() => {
            setPhraseIndex(i => (i + 1) % AUTO_LOGIN_PHRASES.length);
        }, 1800);
        return () => clearInterval(id);
    }, [autoLoginPending]);

    useEffect(() => {
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const result = await window.patService?.autoLogin();
            setAutoLoginPending(false);
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

    if (autoLoginPending) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-screen bg-bg-primary relative overflow-hidden">
                {/* Ambient glows */}
                <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px]
                                bg-accent/[0.06] rounded-full blur-[140px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px]
                                bg-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center gap-8">
                    {/* Animated logo */}
                    <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-accent/10
                                    shadow-[0_0_60px_rgba(167,199,231,0.15),0_0_120px_rgba(167,199,231,0.06)]
                                    animate-pulse-slow">
                        <Waves className="w-10 h-10 text-accent" />
                    </div>

                    {/* Waveform spinner */}
                    <WaveformSpinner bars={7} size="lg" />

                    {/* Rotating phrase */}
                    <p
                        key={phraseIndex}
                        className="text-sm text-text-secondary tracking-wide animate-fade-in"
                    >
                        {AUTO_LOGIN_PHRASES[phraseIndex]}
                    </p>
                </div>

                <style>{`
                    @keyframes fade-in {
                        from { opacity: 0; transform: translateY(4px); }
                        to   { opacity: 1; transform: translateY(0);   }
                    }
                    .animate-fade-in { animation: fade-in 0.4s ease both; }
                    .animate-pulse-slow { animation: pulse 2.6s cubic-bezier(0.4,0,0.6,1) infinite; }
                `}</style>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center w-full h-screen bg-bg-primary p-6 relative overflow-hidden">
            {/* Dual ambient glows */}
            <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px]
                            bg-accent/[0.06] rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px]
                            bg-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />
            <div className="w-full max-w-sm animate-scale-in relative z-10">
                {/* Logo + Title */}
                <div className="flex flex-col items-center mb-8">
                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-5
                                    shadow-[0_0_40px_rgba(167,199,231,0.12),0_0_80px_rgba(167,199,231,0.05)]
                                    transition-shadow duration-700">
                        <Waves className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="text-3xl font-bold text-gradient mb-1.5 tracking-tight">SoundHaus</h1>
                    <p className="text-sm text-text-secondary">Sign in to manage your projects</p>
                </div>

                {/* Form card */}
                <div className="glass-panel-heavy rounded-2xl p-7">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                                Email
                            </label>
                            <input
                                type="text"
                                id="email"
                                name="email"
                                autoComplete="email"
                                className="w-full px-4 py-3 rounded-xl bg-bg-primary/50 border border-border-default
                                           text-text-primary text-sm placeholder:text-text-tertiary
                                           focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none
                                           backdrop-blur-sm
                                           transition-all duration-300"
                                placeholder="you@example.com"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                autoComplete="current-password"
                                className="w-full px-4 py-3 rounded-xl bg-bg-primary/50 border border-border-default
                                           text-text-primary text-sm placeholder:text-text-tertiary
                                           focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none
                                           backdrop-blur-sm
                                           transition-all duration-300"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-error-soft border border-error/20 text-error text-xs">
                                <span>⚠</span> {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2.5 btn-brand px-4 py-3
                                       rounded-xl text-sm font-semibold
                                       disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <LogIn className="w-4 h-4" />
                            {loading ? 'Signing in…' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-text-tertiary mt-6">
                    Create an account at{' '}
                    <span className="text-accent font-medium">thesound.haus</span>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
