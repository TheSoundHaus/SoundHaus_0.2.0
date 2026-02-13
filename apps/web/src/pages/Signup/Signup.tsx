import { useState, type FormEvent } from 'react';
import './Signup.css';

interface SignupPageProps {
  onSignup?: (email: string, password: string, name?: string) => Promise<void>;
  onSwitchToLogin?: () => void;
}

export default function SignupPage({ onSignup, onSwitchToLogin }: SignupPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validatePassword = (pwd: string): { ok: boolean; message: string } => {
    const issues: string[] = [];
    if (pwd.length < 8) issues.push('be at least 8 characters');
    if (!/[a-z]/.test(pwd)) issues.push('include a lowercase letter');
    if (!/[A-Z]/.test(pwd)) issues.push('include an uppercase letter');
    if (!/[0-9]/.test(pwd)) issues.push('include a number');
    if (!/[^A-Za-z0-9]/.test(pwd)) issues.push('include a special character');
    if (issues.length) {
      return { ok: false, message: `Password must ${issues.join(', ')}.` };
    }
    return { ok: true, message: '' };
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validation
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Password strength validation
    const policy = validatePassword(password);
    if (!policy.ok) {
      setError(policy.message);
      alert(policy.message);
      return;
    }

    // Password match validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      if (onSignup) {
        await onSignup(email, password, name.trim() || undefined);
        setSuccess(true);
      } else {
        // Fallback if no onSignup handler
        console.log('Signup attempt:', { email, name });
        alert('Signup successful! (Demo mode)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="signup-container">
        <div className="signup-card">
          <div className="success-message">
            <div className="success-icon">✓</div>
            <h2>Account Created!</h2>
            <p>
              Your account has been created successfully. 
              Please check your email to verify your account.
            </p>
            <button 
              onClick={onSwitchToLogin}
              className="signup-button"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <h1>SoundHaus</h1>
          <p>Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="signup-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="name">Name (Optional)</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              disabled={isLoading}
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">
              Email <span className="required">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isLoading}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Password <span className="required">*</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 chars, upper, lower, digit, special"
              title="Password must be at least 8 characters and include upper, lower, number, and special character"
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">
              Confirm Password <span className="required">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="signup-button"
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Sign Up'}
          </button>

          <div className="terms-text">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </div>
        </form>

        <div className="signup-footer">
          <p>
            Already have an account?{' '}
            <a 
              href="#" 
              className="login-link"
              onClick={(e) => {
                e.preventDefault();
                onSwitchToLogin?.();
              }}
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
