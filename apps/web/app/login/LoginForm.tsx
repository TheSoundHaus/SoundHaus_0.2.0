"use client";

import Link from "next/link";

/**
 * LoginForm Component - Split-screen login layout
 * Left: Sign in form
 * Right: Empty content container
 */
const LoginForm = () => {
  return (
    <div className="min-h-screen flex bg-navy">
      {/* Left Content Container - Sign In Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-12">
            <Link href="/" className="inline-block">
              <h1 className="text-3xl font-bold text-soft-white">SoundHaus</h1>
            </Link>
          </div>

          {/* Header section */}
          <div className="mb-8">
            <h2 className="text-4xl text-soft-white font-semibold mb-2">
              Welcome Back
            </h2>
            <p className="text-lg text-muted">
              Sign in using your credentials
            </p>
          </div>

          {/* Form */}
          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
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
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-glass-blue-500 hover:text-glass-cyan-500 transition-colors duration-150"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit button */}
            <button type="submit" className="btn btn-primary w-full mt-2">
              Sign in
            </button>
          </form>

          {/* Sign up link */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-center text-base text-muted">
              Don't have an account?{" "}
              <Link
                href="/signup"
                className="text-glass-blue-500 hover:text-glass-cyan-500 transition-colors duration-150 font-semibold"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Content Container - Empty */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br relative overflow-hidden bg-soft-white">
        {/* Empty container ready for branding/visuals */}
      </div>
    </div>
  );
};

export default LoginForm;
