import Navbar from '@/components/Navbar';

/**
 * Dashboard Layout - Wrapper for all authenticated dashboard pages
 * Provides consistent navigation via Navbar component
 */
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}