import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
    const navigate = useNavigate();
    const autoLoginAttempted = useRef(false);

    useEffect(() => {
        // Prevent running twice in development mode
        if (autoLoginAttempted.current) return;
        autoLoginAttempted.current = true;

        const attemptPATLogin = async () => {
            const token = await window.patService?.getSoundHausCredentials();
            if (!token) {
                console.log('No saved SoundHaus PAT');
                return;
            }

            // Check if we already have a Gitea token
            const existingGiteaToken = await window.patService?.getGiteaCredentials();
            
            console.log('Attempting PAT auto-login...');

            try {
                // Build URL with optional cached_gitea_token parameter
                let credUrl = 'http://localhost:8000/api/desktop/credentials';
                if (existingGiteaToken) {
                    const params = new URLSearchParams({ cached_gitea_token: existingGiteaToken });
                    credUrl = `${credUrl}?${params.toString()}`;
                }

                const credRes = await fetch(credUrl, {
                    method: 'GET',
                    headers: { Authorization: `token ${token}` }
                });

                if (!credRes.ok) {
                    console.warn('Saved PAT is invalid/expired');
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

                console.log('Auto-login successful');
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
                await window.patService?.setSoundHausCredentials(token);
            } catch (error) {
                console.error('Failed to configure git credentials:', error);
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
            }

            navigate('/home');

        } catch (error) {
            console.error('Error:', error)
        }
    }

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
    )
}

export default LoginPage;