"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Forgot Password Page - Studio Grade aesthetic
 * Balanced zinc neutrals with electric cyan accents
 * API Call: Password reset request (sends email with reset token)
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement password reset API call
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 relative">
      {/* Subtle noise texture overlay */}
      <div className="fixed inset-0 opacity-[0.015] pointer-events-none"
           style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")'}}
      />

      {/* Ambient glow effect */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]
                    bg-glass-blue/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Header */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block group">
            <span className="text-3xl font-bold tracking-tight text-zinc-50 transition-all duration-300 group-hover:text-glass-blue">
              Sound<span className="text-glass-blue">Haus</span>
            </span>
          </Link>
        </div>

        {/* Form Card */}
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm p-8
                      shadow-[0_0_50px_rgba(0,0,0,0.3)]">
          {!submitted ? (
            <>
              <h1 className="mb-2 text-2xl font-bold text-zinc-50 tracking-tight">
                Forgot Password?
              </h1>
              <p className="mb-6 text-sm text-zinc-400">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="group">
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                             transition-all duration-300
                             focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                             hover:border-zinc-700"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-glass-blue to-glass-blue-400 text-zinc-950 font-semibold py-3 px-6 rounded-lg
                           transition-all duration-300
                           hover:from-glass-highlight hover:to-glass-blue hover:shadow-[0_0_30px_rgba(167,199,231,0.3)]
                           active:scale-[0.98]
                           focus:outline-none focus:ring-2 focus:ring-glass-blue/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
                >
                  Send Reset Link
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-zinc-400">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-medium text-glass-blue hover:text-glass-highlight transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Back to Login
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Success state with animated icon */}
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                              bg-glass-blue/10 border border-glass-blue/20 mb-4
                              animate-scale-in">
                  <svg className="w-8 h-8 text-glass-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              <h1 className="mb-2 text-center text-2xl font-bold text-zinc-50 tracking-tight">
                Check Your Email
              </h1>
              <p className="mb-4 text-center text-sm text-zinc-400">
                We've sent a password reset link to{" "}
                <span className="font-medium text-glass-blue">{email}</span>
              </p>
              <p className="mb-6 text-center text-sm text-zinc-500">
                If you don't see it, check your spam folder or try again.
              </p>
              <Link
                href="/login"
                className="block w-full bg-gradient-to-r from-glass-blue to-glass-blue-400 text-zinc-950 font-semibold py-3 px-6 rounded-lg text-center
                         transition-all duration-300
                         hover:from-glass-highlight hover:to-glass-blue hover:shadow-[0_0_30px_rgba(167,199,231,0.3)]
                         active:scale-[0.98]
                         focus:outline-none focus:ring-2 focus:ring-glass-blue/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
              >
                Back to Login
              </Link>
            </>
          )}
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center text-sm text-zinc-500">
          Don't have an account?{" "}
          <Link href="/signup" className="font-medium text-glass-blue hover:text-glass-highlight transition-colors duration-300 hover:underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
