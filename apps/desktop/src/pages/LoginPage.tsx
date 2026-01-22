import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
    const [didOpen, setDidOpen] = useState(false);
    const navigate = useNavigate();

    const handleSignInClick = () => {
        // window.open("http://www.rickleinecker.com/", "_blank");
        setDidOpen(true);
        setTimeout(() => {
            navigate('/home');
        }, 1500);
    }

    useEffect(() => {
        const attemptPATLogin = async () => {
            const token = window.gitService?.getSoundHausCredentials();
            if(!token) return;

            try{
                const credRes = await fetch('http://localhost:8000/api/desktop/credentials', {
                    method: 'POST',
                    headers: { Authorization: `token ${token}`}
                });

                if(!credRes.ok) {
                    console.warn('Saved PAT is invalid/expired');
                    return
                }

                navigate('/home');
            } catch(err) {
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

            const formData = new FormData();
            formData.append('token_name', 'Gitea Token');
            formData.append('expires_in_days', '90');

            const patRes = await fetch('http://localhost:8000/api/auth/tokens', {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: formData
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
            <p>
                {didOpen
                    ? 'A browser window should have opened automatically. Please sign in or create an account.'
                    : 'Click the button below to sign in with your SoundHaus account.'}
            </p>

            <button onClick={handleSignInClick}>{didOpen ? 'Open Login Page Again' : 'Sign In with Browser'}</button>

            <div>
                <p>
                    After signing in, this window will automatically detect your authentication
                    and you'll be logged into the desktop app.
                </p>
            </div>

            <p>~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~</p>
            <p>Pssss. Secret login section here:</p>
            <form onSubmit={handleSubmit}>
                <label htmlFor="username">Username: </label>
                <input type="text" id="username" name="username"></input>
                <br></br>
                <label htmlFor="password">Password: </label>
                <input type="password" id="password" name="password"></input>
                <br></br>
                <button type="submit">Log In</button>
            </form>
        </div>
    )
}

export default LoginPage;