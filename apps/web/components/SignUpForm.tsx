import React, { useActionState } from "react";
import { signup } from "@/actions/auth";
import Spinner from "@/components/Spinner";

export default function SignUpForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <>
      {/* Form */}
      <form className="space-y-4" action={action}>
        {/* Username field */}
        <div className="group">
          <label
            htmlFor="username"
            className="block text-sm font-medium text-zinc-300 mb-2"
          >
            Username
          </label>
          <input
            type="text"
            id="username"
            name="username"
            className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                                         transition-all duration-300
                                         focus:outline-none focus:ring-1
                                         ${state?.errors?.username
                                           ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                                           : 'border-zinc-800 focus:border-glass-blue focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)] hover:border-zinc-700'
                                         }`}
            placeholder="Choose a username"
            autoComplete="username"
            required
          />
        </div>
        {state?.errors?.username && (
          <div className="text-sm text-red-400 mt-1">
            <ul className="space-y-1">
              {state.errors.username.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Email field */}
        <div className="group">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-zinc-300 mb-2"
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                                         transition-all duration-300
                                         focus:outline-none focus:ring-1
                                         ${state?.errors?.email
                                           ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                                           : 'border-zinc-800 focus:border-glass-blue focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)] hover:border-zinc-700'
                                         }`}
            placeholder="your.email@example.com"
            autoComplete="email"
            required
          />
        </div>
        {state?.errors?.email && (
          <div className="text-sm text-red-400 mt-1">
            <ul className="space-y-1">
              {state.errors.email.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Password field */}
        <div className="group">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-zinc-300 mb-2"
          >
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                                         transition-all duration-300
                                         focus:outline-none focus:ring-1
                                         ${state?.errors?.password
                                           ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                                           : 'border-zinc-800 focus:border-glass-blue focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)] hover:border-zinc-700'
                                         }`}
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />
        </div>
        {state?.errors?.password && (
          <div className="text-sm text-red-400 mt-1">
            <p className="font-medium mb-1">Password must:</p>
            <ul className="space-y-1 ml-2">
              {state.errors.password.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Confirm Password field */}
        <div className="group">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-zinc-300 mb-2"
          >
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            className={`w-full bg-zinc-900 border rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                                         transition-all duration-300
                                         focus:outline-none focus:ring-1
                                         ${state?.errors?.confirmPassword
                                           ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50'
                                           : 'border-zinc-800 focus:border-glass-blue focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)] hover:border-zinc-700'
                                         }`}
            placeholder="Confirm your password"
            autoComplete="new-password"
            required
          />
        </div>
        {state?.errors?.confirmPassword && (
          <div className="text-sm text-red-400 mt-1">
            <ul className="space-y-1">
              {state.errors.confirmPassword.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* General error message */}
        {state?.message && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg px-4 py-3 text-sm text-red-400">
            {state.message}
          </div>
        )}

        {/* Submit button */}
        <button
          disabled={pending}
          type="submit"
          className="w-full bg-gradient-to-r from-glass-blue to-glass-blue-400 text-zinc-950 font-semibold py-3 px-6 rounded-lg
                                     transition-all duration-300
                                     hover:from-glass-highlight hover:to-glass-blue hover:shadow-[0_0_30px_rgba(167,199,231,0.3)]
                                     active:scale-[0.98]
                                     focus:outline-none focus:ring-2 focus:ring-glass-blue/50 focus:ring-offset-2 focus:ring-offset-zinc-950
                                     disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:from-glass-blue disabled:hover:to-glass-blue-400 disabled:active:scale-100
                                     flex items-center justify-center gap-2"
        >
          {pending && <Spinner size="sm" />}
          {pending ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </>
  );
}
