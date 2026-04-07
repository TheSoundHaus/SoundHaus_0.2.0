import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

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
        const email = (document.getElementById('username') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;

        const result = await window.patService?.manualLogin(email, password);
        if (!result) {
            console.error('manualLogin IPC unavailable — is patService loaded?');
            return;
        }

        if (result.success) {
            navigate('/home');
        } else {
            console.error('Login failed', result);
        }
    };

    return(
        <div>
            <h1>Welcome to SoundHaus</h1>
            <p>Please sign in or create an account below</p>
            <form onSubmit={handleSubmit}>
                <label htmlFor="username">Username: </label>
                <input type="text" id="username" name="username"></input>
                <br></br>
                <label htmlFor="password">Password: </label>
                <input type="password" id="password" name="password"></input>
                <br></br>
                <br></br>
                <button type="submit">Log In</button>
            </form>
        </div>
    );
};

export default LoginPage;
