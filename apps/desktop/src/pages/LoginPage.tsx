import { useState } from 'react';
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
        </div>
    )
}

export default LoginPage;