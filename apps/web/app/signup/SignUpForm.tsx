'use client'

import Link from "next/link";

/**
 * SignUpForm Component - Split-screen signup layout
 * Left: Sign up form
 * Right: Empty content container
 */
const SignUpForm = () => {
  return (
    <div className="min-h-screen flex bg-navy">
      {/* Logo/Brand - Top Left */}
      <div className="absolute top-4 left-4 lg:top-8 lg:left-8 z-10">
        <Link href="/" className="inline-block">
          <h1 className="text-3xl font-bold text-soft-white">SoundHaus</h1>
        </Link>
      </div>

      {/* Left Content Container - Sign Up Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-md pt-20 lg:pt-0">
          {/* Header section */}
          <div className="mb-8">
            <h2 className="text-4xl text-soft-white font-semibold mb-2">
              Create Account
            </h2>
            <p className="text-lg text-muted">
              Join SoundHaus and start collaborating
            </p>
          </div>

          {/* Form */}
          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            {/* Username field */}
            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                className="input"
                placeholder="Choose a username"
                autoComplete="username"
                required
              />
            </div>

            {/* Email field */}
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="input"
                placeholder="your.email@example.com"
                autoComplete="email"
                required
              />
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                className="input"
                placeholder="Create a password"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Confirm Password field */}
            <div>
              <label htmlFor="confirmPassword" className="label">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className="input"
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Submit button */}
            <button type="submit" className="btn btn-primary w-full mt-2">
              Create Account
            </button>
          </form>

          {/* Sign in link */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-center text-base text-muted">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-glass-blue-500 hover:text-glass-cyan-500 transition-colors duration-150 font-semibold"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Content Container - Empty */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-navy via-navy to-zinc-900 relative overflow-hidden">
        {/* Empty container ready for branding/visuals */}
      </div>
    </div>
  );
};

export default SignUpForm;
