import { getPublicProfile } from "@/lib/api/profile";
import UserAvatar from "@/components/UserAvatar";
import { Calendar, User } from "lucide-react";

interface Params {
  username: string;
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username } = await params;
  const result = await getPublicProfile(username);

  if (!result.success) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="rounded-lg border border-zinc-800 p-12">
          <User size={48} className="mx-auto mb-4 text-zinc-600" />
          <h1 className="mb-2 text-2xl font-bold">Profile Not Found</h1>
          <p className="text-zinc-500">
            This user doesn&apos;t exist or their profile is private.
          </p>
        </div>
      </main>
    );
  }

  const profile = result.data;

  // Format account creation date
  function formatDate(iso: string | null): string {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Profile Header */}
      <div className="mb-8 rounded-lg border border-zinc-800 p-8">
        <div className="flex items-start gap-6">
          <UserAvatar
            src={profile.avatar_url}
            alt={profile.display_name || profile.username}
            size={96}
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">
              {profile.display_name || profile.username}
            </h1>
            <p className="mt-1 text-lg text-zinc-400">@{profile.username}</p>

            {profile.bio && (
              <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                {profile.bio}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
              <Calendar size={14} />
              <span>Joined {formatDate(profile.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Public Repos placeholder */}
      <div className="rounded-lg border border-zinc-800 p-8">
        <h2 className="mb-4 text-xl font-semibold">Public Projects</h2>
        <p className="text-sm text-zinc-500">
          Public repositories will be displayed here once the feature is fully enabled.
        </p>
      </div>
    </main>
  );
}
