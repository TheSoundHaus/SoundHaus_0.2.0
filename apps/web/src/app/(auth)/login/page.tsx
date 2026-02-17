"use client";

import Link from "next/link";

/**
 * Login Page - Studio Grade aesthetic
 * Balanced zinc neutrals with electric cyan accents
 */
export default function LoginPage() {
    return (
        <div className="min-h-screen flex bg-zinc-950">
            {/* Subtle noise texture overlay */}
            <div className="fixed inset-0 opacity-[0.015] pointer-events-none"
                 style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")'}}
            />

            {/* Left Content Container - Sign In Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-8 relative z-10">
                <div className="w-full max-w-md">
                    {/* Logo/Brand */}
                    <div className="mb-12">
                        <Link href="/" className="inline-block group">
                            <h1 className="text-3xl font-bold text-zinc-50 tracking-tight transition-all duration-300 group-hover:text-glass-blue">
                                Sound<span className="text-glass-blue">Haus</span>
                            </h1>
                        </Link>
                    </div>

                    {/* Header section */}
                    <div className="mb-8">
                        <h2 className="text-4xl text-zinc-50 font-semibold mb-2 tracking-tight">
                            Welcome Back
                        </h2>
                        <p className="text-lg text-zinc-400">
                            Sign in to continue your session
                        </p>
                    </div>

                    {/* Form */}
                    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
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
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        {/* Forgot password link */}
                        <div className="flex justify-end">
                            <Link
                                href="/forgot-password"
                                className="text-sm text-glass-blue hover:text-glass-highlight transition-all duration-300 hover:underline underline-offset-4"
                            >
                                Forgot password?
                            </Link>
                        </div>

                        {/* Submit button */}
                        <button
                            type="submit"
                            className="w-full mt-2 bg-gradient-to-r from-glass-blue to-glass-blue-400 text-zinc-950 font-semibold py-3 px-6 rounded-lg
                                     transition-all duration-300
                                     hover:from-glass-highlight hover:to-glass-blue hover:shadow-[0_0_30px_rgba(167,199,231,0.3)]
                                     active:scale-[0.98]
                                     focus:outline-none focus:ring-2 focus:ring-glass-blue/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
                        >
                            Sign in
                        </button>
                    </form>

                    {/* Sign up link */}
                    <div className="mt-6 pt-6 border-t border-zinc-800/50">
                        <p className="text-center text-base text-zinc-400">
                            Don't have an account?{" "}
                            <Link
                                href="/signup"
                                className="text-glass-blue hover:text-glass-highlight transition-colors duration-300 font-semibold hover:underline underline-offset-4"
                            >
                                Sign up
                            </Link>
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Content Container - Gradient Accent */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Radial gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />

                {/* Electric accent glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]
                              bg-glass-blue/10 rounded-full blur-[120px] animate-pulse-subtle" />

                {/* Geometric pattern overlay */}
                <div className="absolute inset-0 opacity-[0.03]"
                     style={{backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(167,199,231,0.5) 35px, rgba(167,199,231,0.5) 36px)'}}
                />
            </div>
        </div>
    );
}
