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
          <h1 className="text-2xl font-bold tracking-tight">SoundHaus</h1>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
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
        </div>
      </nav>

      {/* Hero Section */}
      <main className="mx-auto max-w-7xl px-6 py-16">
        <section className="mb-24 text-center">
          <h2 className="mb-6 text-5xl font-bold tracking-tight">
            Collaborative Music Production,
            <br />
            <span className="text-zinc-400">Asynchronously</span>
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-400">
            SoundHaus enables seamless collaboration on Ableton projects.
            Share, version, and evolve your music with git-powered workflow.
          </p>
          <Link
            href="/explore"
            className="inline-block rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Explore Projects
          </Link>
        </section>

        {/* Features Overview */}
        <section className="mb-24 grid gap-8 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 p-6">
            <h3 className="mb-3 text-xl font-semibold">Desktop Integration</h3>
            <p className="text-zinc-400">
              Work locally with Ableton, sync seamlessly with our desktop app
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 p-6">
            <h3 className="mb-3 text-xl font-semibold">Version Control</h3>
            <p className="text-zinc-400">
              Git-powered project history. Never lose a version again
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 p-6">
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
            className="rounded-lg border border-zinc-800 p-8 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <h3 className="mb-2 text-xl font-semibold">Explore Repositories</h3>
            <p className="text-zinc-400">Browse public Ableton projects from the community</p>
          </Link>
          <Link
            href="/repositories"
            className="rounded-lg border border-zinc-800 p-8 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <h3 className="mb-2 text-xl font-semibold">Your Repositories</h3>
            <p className="text-zinc-400">Manage your remote projects and collaborations</p>
          </Link>
        </section>
      </main>
    </div>
  );
}
