import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
    const [didOpen, setDidOpen] = useState(false);
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);

    const handleSignInClick = () => {
        // window.open("http://www.rickleinecker.com/", "_blank");
        setDidOpen(true);
        setTimeout(() => {
            navigate('/home');
        }, 1500);
    }

    useEffect(() => {
        // Prevent running twice in development mode
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const token = await window.gitService?.getSoundHausCredentials();
            
            if (!token) {
                console.log('No saved PAT found');
                return;
            }

            console.log('Attempting PAT login with token:', token.substring(0, 20) + '...');

            try {
                const credRes = await fetch('http://localhost:8000/api/desktop/credentials', {
                    method: 'GET',
                    headers: { Authorization: `token ${token}` }
                });

                console.log('Response status:', credRes.status);

                if (!credRes.ok) {
                    console.warn('Saved PAT is invalid/expired');
                    return;
                }

                console.log('Auto-login successful!');
                navigate('/home');
            } catch (err) {
                console.warn('Auto-login failed', err);
            }
        };

        void attemptPATLogin();
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const email = (document.getElementById('username') as HTMLInputElement).value
        const password = (document.getElementById('password') as HTMLInputElement).value
        
        try {
            const loginRes = await fetch('http://localhost:8000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            
            if (!loginRes.ok) {
                console.error('Login failed')
                console.error(loginRes)
                return
            }

            const loginData = await loginRes.json()
            const accessToken = loginData.session.access_token

            if(!accessToken) {
                console.error('No access token returned from login');
                return;
            }

            const patRes = await fetch('http://localhost:8000/api/auth/tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ token_name: 'Gitea Token', expires_in_days: 90 }),
            })

            if(!patRes.ok) {
                const errorData = await patRes.json().catch(() => ({}));
                console.error('PAT creation failed with status:', patRes.status);
                console.error('Error response:', JSON.stringify(errorData, null, 2));
                return;
            }

            const patData = await patRes.json();
            const token = patData.token;

            try {
                await window.gitService?.setSoundHausCredentials(token);
            } catch (error) {
                console.error('Failed to configure git credentials:', error);
                return;
            }

            // Also need to call /api/desktop/credentials for gitea credentials

            navigate('/home');

        } catch (error) {
            console.error('Error:', error)
        }
    }

    return(
        <div>
            <h1>Welcome to SoundHaus</h1>
            {/* <p>
                {didOpen
                    ? 'A browser window should have opened automatically. Please sign in or create an account.'
                    : 'Click the button below to sign in with your SoundHaus account.'}
            </p> */}

            <p>Please sign in or create an account below</p>

            {/* <button onClick={handleSignInClick}>{didOpen ? 'Open Login Page Again' : 'Sign In with Browser'}</button> */}

            {/* <div>
                <p>
                    After signing in, this window will automatically detect your authentication
                    and you'll be logged into the desktop app.
                </p>
            </div> */}

            {/* <p>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~</p>
            <p>Pssss. Secret login section here:</p> */}
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
    )
}

export default LoginPage;