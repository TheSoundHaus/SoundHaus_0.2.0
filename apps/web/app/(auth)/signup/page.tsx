"use client";

import SignUpForm from "@/components/SignUpForm";
import Link from "next/link";

/**
 * Signup Page - Studio Grade aesthetic
 * Balanced zinc neutrals with electric cyan accents
 */
export default function SignupPage() {

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

                    < SignUpForm/>

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
}
