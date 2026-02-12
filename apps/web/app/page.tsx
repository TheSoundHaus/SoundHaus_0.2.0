import Link from "next/link";

/**
 * Landing Page - Hero section with call to action
 * Entry point for new users to join SoundHaus
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      {/* Navigation */}
      <nav className="absolute top-0 right-0 p-6">
        <Link
          href="/dashboard"
          className="btn btn-secondary text-sm"
        >
          Go to Dashboard
        </Link>
      </nav>

      {/* Hero Section */}
      <main className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-5xl font-bold tracking-tight">
            Collaborative Music Production,
            <br />
            <span className="text-glass-blue-400" style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.4)'}}>Asynchronously</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-400">
            SoundHaus enables seamless collaboration on Ableton projects.
            Share, version, and evolve your music with git-powered workflow.
          </p>
          <Link
            href="/signup"
            className="btn btn-primary inline-block"
          >
            Join Now
          </Link>
        </div>
      </main>
    </div>
  );
}
