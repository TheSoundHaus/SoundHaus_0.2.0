import Navbar from "@/components/Navbar";
import { GiteaProvider } from "@/lib/context/GiteaContext";
import { AuthProvider } from "@/lib/context/AuthContext";


/**
 * Dashboard Layout - Wrapper for all authenticated dashboard pages
 * Provides consistent navigation via Navbar component
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <GiteaProvider>
      <div className="min-h-screen bg-zinc-900 text-zinc-100">
        <Navbar />
        <main>{children}</main>
      </div>
    </GiteaProvider>
    </AuthProvider>
    
  );
}
