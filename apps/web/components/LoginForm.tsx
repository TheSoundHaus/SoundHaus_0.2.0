import { useActionState } from "react";
import { login } from "@/lib/services/auth.service";
import Link from "next/link";
import Spinner from "./Spinner";

const LoginForm = () => {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <>
      {/* Form */}
      <form className="space-y-5" action={action}>
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
            className={`w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                                         transition-all duration-300
                                         focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                                         hover:border-zinc-700

                                         ${
                                           state?.errors?.email
                                             ? "border-red-500 focus:border-red-500 focus:ring-red-500/50"
                                             : "border-zinc-800 focus:border-glass-blue focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)] hover:border-zinc-700"
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
            className={`w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 placeholder-zinc-600
                                         transition-all duration-300
                                         focus:outline-none focus:border-glass-blue focus:ring-1 focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)]
                                         hover:border-zinc-700

                                         ${
                                           state?.errors?.email
                                             ? "border-red-500 focus:border-red-500 focus:ring-red-500/50"
                                             : "border-zinc-800 focus:border-glass-blue focus:ring-glass-blue/50 focus:shadow-[0_0_20px_rgba(167,199,231,0.15)] hover:border-zinc-700"
                                         }`}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
        </div>
        {state?.errors?.password && (
          <div className="text-sm text-red-400 mt-1">
            <ul className="space-y-1">
              {state.errors.password.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

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
          disabled={pending}
          type="submit"
          className="w-full mt-2 bg-gradient-to-r from-glass-blue to-glass-blue-400 text-zinc-950 font-semibold py-3 px-6 rounded-lg
                                     transition-all duration-300
                                     hover:from-glass-highlight hover:to-glass-blue hover:shadow-[0_0_30px_rgba(167,199,231,0.3)]
                                     active:scale-[0.98]
                                     focus:outline-none focus:ring-2 focus:ring-glass-blue/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
          {pending && <Spinner size="sm" />}
          {pending ? "Logging in..." : "Log In"}
        </button>
      </form>
    </>
  );
};

export default LoginForm;
