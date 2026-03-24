"use client";

import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import { Waves } from "lucide-react";

/**
 * Login Page - Studio-grade aesthetic
 * Left: sign-in form with clean zinc design
 * Right: blurred studio photography with glass overlay
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
                        <Link href="/" className="inline-flex items-center gap-2 group">
                            <Waves className="w-7 h-7 text-glass-blue-400 transition-transform duration-300 group-hover:scale-110" />
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

                    {/* Forgot password link */}
                    <div className="flex justify-end mb-4">
                        <Link
                            href="/forgot-password"
                            className="text-sm text-glass-blue hover:text-glass-highlight transition-all duration-300 hover:underline underline-offset-4"
                        >
                            Forgot password?
                        </Link>
                    </div>

                    <LoginForm />

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

            {/* Right Content Container - Studio Image */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Studio photograph background with blur */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage: 'url("https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1920&q=80")',
                        filter: "blur(2px) brightness(0.35)",
                    }}
                />

                {/* Gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent" />

                {/* Bottom branding on image side */}
                <div className="absolute bottom-8 left-8 right-8 z-10">
                    <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
                        Version control built for music producers.
                        Push, diff, branch, and collaborate — see every note that changed.
                    </p>
                </div>

                {/* Subtle glass-blue accent glow */}
                <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px]
                              bg-glass-blue/8 rounded-full blur-[100px]" />
            </div>
        </div>
    );
}
