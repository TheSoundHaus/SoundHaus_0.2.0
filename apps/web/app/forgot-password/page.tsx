"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Forgot Password Page - Password recovery flow
 * Allows users to request password reset link
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold tracking-tight text-zinc-100">
            SoundHaus
          </Link>
        </div>

        {/* Form Card */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8">
          {!submitted ? (
            <>
              <h1 className="mb-2 text-2xl font-bold text-zinc-100">
                Forgot Password?
              </h1>
              <p className="mb-6 text-sm text-zinc-400">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-zinc-100"
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
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-zinc-100 px-4 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
                >
                  Send Reset Link
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-zinc-400">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-medium text-zinc-100 hover:underline"
                >
                  Back to Login
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 text-center text-4xl">✉️</div>
              <h1 className="mb-2 text-center text-2xl font-bold text-zinc-100">
                Check Your Email
              </h1>
              <p className="mb-6 text-center text-sm text-zinc-400">
                We've sent a password reset link to{" "}
                <span className="font-medium text-zinc-100">{email}</span>
              </p>
              <p className="mb-6 text-center text-sm text-zinc-400">
                If you don't see it, check your spam folder or try again.
              </p>
              <Link
                href="/login"
                className="block w-full rounded-md bg-zinc-100 px-4 py-3 text-center font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                Back to Login
              </Link>
            </>
          )}
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center text-sm text-zinc-500">
          Don't have an account?{" "}
          <Link href="/signup" className="font-medium text-zinc-300 hover:underline">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
