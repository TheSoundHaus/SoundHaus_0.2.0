import { useState } from 'react'
import LoginPage from './pages/Login'
import SignupPage from './pages/Signup'
import HomePage from './pages/Home'
import TopNav from './components/TopNav'
import ReposPage from './pages/Repos'
import RepoPage from './pages/Repo'
import ExplorePage from './pages/Explore'
import { authAPI, type User } from './lib/api'
import { ErrorBoundary } from './components/ErrorBoundary'
import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

type AuthView = 'login' | 'signup';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<AuthView>('login');

  const handleLogin = async (email: string, password: string) => {
    try {
      console.log('[App] handleLogin - calling authAPI.login');
      const data = await authAPI.login(email, password);
      console.log('[App] handleLogin - received data:', data);
      console.log('[App] handleLogin - data.success:', data.success);
      console.log('[App] handleLogin - data.session:', data.session);
      
      if (data.success && data.user && data.session) {
        // Store session in localStorage
        console.log('[App] Storing tokens in localStorage');
        console.log('[App] access_token:', data.session.access_token ? `${data.session.access_token.substring(0, 20)}...` : 'MISSING');
        console.log('[App] refresh_token:', data.session.refresh_token ? `${data.session.refresh_token.substring(0, 20)}...` : 'MISSING');
        
  localStorage.setItem('access_token', data.session.access_token);
  localStorage.setItem('refresh_token', data.session.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
        
        // Verify storage
        const storedToken = localStorage.getItem('access_token');
        console.log('[App] Verified token stored:', storedToken ? `${storedToken.substring(0, 20)}...` : 'NOT FOUND');
        
        setUser(data.user);
        console.log('[App] Login successful, user set:', data.user);
      } else {
        console.error('[App] Invalid response - missing success/user/session');
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('[App] Login error:', error);
      throw error;
    }
  };

  const handleSignup = async (email: string, password: string, name?: string) => {
    try {
      const metadata = name ? { name } : undefined;
      const data = await authAPI.signup(email, password, metadata);
      
      if (data.success) {
        console.log('Signup successful:', data);
        // Don't auto-login, let user verify email first
        // Success message will be shown in SignupPage component
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  // If user is logged in, show the home page (repos)
  // If user is logged in, show the navbar and main app pages
  if (user) {
    return (
       <BrowserRouter>
        <TopNav />
          <main className="app-content" style={{ paddingTop: "90px" }}>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/repos" element={<ReposPage />} />
                <Route path="/repos/:id" element={<RepoPage />} />
                <Route path="/explore" element={<ExplorePage />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </BrowserRouter>
    );
  }

  // Show signup or login page based on current view (no navbar)
  if (currentView === 'signup') {
    return (
      <SignupPage 
        onSignup={handleSignup}
        onSwitchToLogin={() => setCurrentView('login')}
      />
    );
  }

  return (
    <LoginPage 
      onLogin={handleLogin}
      onSwitchToSignup={() => setCurrentView('signup')}
    />
  )
}

export default App