import Link from "next/link";

/**
 * Navigation Component - Reusable navigation header
 * Displays site logo and primary navigation links
 *
 * @param showAuth - Whether to show login/signup buttons (for logged out state)
 */

interface NavigationProps {
  showAuth?: boolean;
}

export default function Navigation({ showAuth = false }: NavigationProps) {
  return (
    <nav className="border-b border-zinc-800 px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight text-zinc-100">
          SoundHaus
        </Link>

        {showAuth ? (
          <div className="flex gap-4">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Sign Up
            </Link>
          </div>
        ) : (
          <div className="flex gap-4">
            <Link
              href="/explore"
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              Explore
            </Link>
            <Link
              href="/repositories"
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              My Repositories
            </Link>
            <Link
              href="/settings"
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              Settings
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
