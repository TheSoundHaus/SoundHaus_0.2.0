import Link from "next/link";

/**
 * Home Page - Landing page with mission statement, overview, and navigation
 * Acts as entry point for new users exploring SoundHaus
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      {/* Navigation Header */}
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight" style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.3)'}}>
            SoundHaus
          </h1>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 hover:bg-zinc-800 text-zinc-300 hover:text-glass-blue-400"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="btn btn-primary text-sm"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="mx-auto max-w-7xl px-6 py-16">
        <section className="mb-24 text-center">
          <h2 className="mb-6 text-5xl font-bold tracking-tight">
            Collaborative Music Production,
            <br />
            <span className="text-glass-blue-400" style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.4)'}}>Asynchronously</span>
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-400">
            SoundHaus enables seamless collaboration on Ableton projects.
            Share, version, and evolve your music with git-powered workflow.
          </p>
          <Link
            href="/explore"
            className="btn btn-primary inline-block"
          >
            Explore Projects
          </Link>
        </section>

        {/* Features Overview */}
        <section className="mb-24 grid gap-8 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 p-6 transition-all duration-300 hover:border-glass-blue-500/30 hover:shadow-[0_0_20px_rgba(167,199,231,0.1)]">
            <h3 className="mb-3 text-xl font-semibold">Desktop Integration</h3>
            <p className="text-zinc-400">
              Work locally with Ableton, sync seamlessly with our desktop app
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 p-6 transition-all duration-300 hover:border-glass-blue-500/30 hover:shadow-[0_0_20px_rgba(167,199,231,0.1)]">
            <h3 className="mb-3 text-xl font-semibold">Version Control</h3>
            <p className="text-zinc-400">
              Git-powered project history. Never lose a version again
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 p-6 transition-all duration-300 hover:border-glass-blue-500/30 hover:shadow-[0_0_20px_rgba(167,199,231,0.1)]">
            <h3 className="mb-3 text-xl font-semibold">Social Discovery</h3>
            <p className="text-zinc-400">
              Explore public projects and collaborate with producers worldwide
            </p>
          </div>
        </section>

        {/* Quick Links */}
        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/explore"
            className="rounded-lg border border-zinc-800 p-8 transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_25px_rgba(167,199,231,0.15)] group"
          >
            <h3 className="mb-2 text-xl font-semibold group-hover:text-glass-blue-400 transition-colors duration-300">
              Explore Repositories
            </h3>
            <p className="text-zinc-400">Browse public Ableton projects from the community</p>
          </Link>
          <Link
            href="/repositories"
            className="rounded-lg border border-zinc-800 p-8 transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_25px_rgba(167,199,231,0.15)] group"
          >
            <h3 className="mb-2 text-xl font-semibold group-hover:text-glass-blue-400 transition-colors duration-300">
              Your Repositories
            </h3>
            <p className="text-zinc-400">Manage your remote projects and collaborations</p>
          </Link>
        </section>
      </main>
    </div>
  );
}
