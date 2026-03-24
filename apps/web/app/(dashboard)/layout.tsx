import Navbar from '@/components/Navbar';
import { UserProvider } from '@/lib/context/UserContext';

/**
 * Dashboard Layout - Wrapper for all authenticated dashboard pages
 * Provides consistent navigation via Navbar and user profile context
 */
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <UserProvider>
      <div className="min-h-screen bg-zinc-900 text-zinc-100">
        <Navbar />
        <main>{children}</main>
      </div>
    </UserProvider>
  );
}