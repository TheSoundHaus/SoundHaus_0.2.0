import { getEnrichedRepos } from "@/lib/api/repos";
import { getAllGenres } from "@/lib/api/genre";
import { getPendingInvitations } from "@/lib/api/invitations";
import RepositoriesClient from "./RepositoriesClient";
import type { EnrichedRepo, Genre, Invitation } from "@/lib/types/api";

export default async function RepositoriesPage() {
  const [repoResult, genreResult, inviteResult] = await Promise.all([
    getEnrichedRepos(),
    getAllGenres(),
    getPendingInvitations(),
  ]);

  const repos: EnrichedRepo[] = repoResult.success ? repoResult.data : [];
  const genres: Genre[] = genreResult.success ? genreResult.data : [];
  const invitations: Invitation[] = inviteResult.success ? inviteResult.data : [];

  return <RepositoriesClient repos={repos} genres={genres} invitations={invitations} />;
}
