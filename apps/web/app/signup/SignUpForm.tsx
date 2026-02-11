'use client'

import Link from "next/link";

/**
 * SignUpForm Component - Studio Grade aesthetic
 * Balanced zinc neutrals with electric cyan accents
 */
const SignUpForm = () => {
  return (
    <div className="min-h-screen flex bg-zinc-950">
      {/* Subtle noise texture overlay */}
      <div className="fixed inset-0 opacity-[0.015] pointer-events-none"
           style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")'}}
      />

      {/* Left Content Container - Sign Up Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-8">
            <Link href="/" className="inline-block group">
              <h1 className="text-3xl font-bold text-zinc-50 tracking-tight transition-all duration-300 group-hover:text-glass-blue">
                Sound<span className="text-glass-blue">Haus</span>
              </h1>
            </Link>
          </div>

          {/* Header section */}
          <div className="mb-6">
            <h2 className="text-4xl text-zinc-50 font-semibold mb-2 tracking-tight">
              Create Account
            </h2>
            <p className="text-lg text-zinc-400">
              Join SoundHaus and start collaborating
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {/* Username field */}
            <div className="group">
              <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-2">
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                         transition-all duration-300
                         focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                         hover:border-zinc-700"
                placeholder="Choose a username"
                autoComplete="username"
                required
              />
            </div>

            {/* Email field */}
            <div className="group">
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                         transition-all duration-300
                         focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                         hover:border-zinc-700"
                placeholder="your.email@example.com"
                autoComplete="email"
                required
              />
            </div>

            {/* Password field */}
            <div className="group">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                         transition-all duration-300
                         focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                         hover:border-zinc-700"
                placeholder="Create a password"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Confirm Password field */}
            <div className="group">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                         transition-all duration-300
                         focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                         hover:border-zinc-700"
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-glass-blue to-glass-blue-400 text-zinc-950 font-semibold py-3 px-6 rounded-lg
                       transition-all duration-300
                       hover:from-glass-highlight hover:to-glass-blue hover:shadow-[0_0_30px_rgba(167,199,231,0.3)]
                       active:scale-[0.98]
                       focus:outline-none focus:ring-2 focus:ring-glass-blue/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              Create Account
            </button>
          </form>

          {/* Sign in link */}
          <div className="mt-5 pt-5 border-t border-zinc-800/50">
            <p className="text-center text-base text-zinc-400">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-glass-blue hover:text-glass-highlight transition-colors duration-300 font-semibold hover:underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Content Container - Gradient Accent */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Radial gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />

        {/* Electric accent glow - different position for variety */}
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px]
                      bg-glass-blue/10 rounded-full blur-[120px] animate-pulse-subtle" />
        <div className="absolute bottom-1/3 right-1/3 w-[400px] h-[400px]
                      bg-glass-blue-400/5 rounded-full blur-[100px]" />

        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
             style={{backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(167,199,231,0.5) 35px, rgba(167,199,231,0.5) 36px)'}}
        />
      </div>
    </div>
  );
};

export default SignUpForm;
