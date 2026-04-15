import { getEnrichedRepos } from "@/lib/api/repos";
import { getAllGenres } from "@/lib/api/genre";
import RepositoriesClient from "./RepositoriesClient";
import type { EnrichedRepo, Genre } from "@/lib/types/api";

export default async function RepositoriesPage() {
  const [repoResult, genreResult] = await Promise.all([
    getEnrichedRepos(),
    getAllGenres(),
  ]);

  const repos: EnrichedRepo[] = repoResult.success ? repoResult.data : [];
  const genres: Genre[] = genreResult.success ? genreResult.data : [];

  return <RepositoriesClient repos={repos} genres={genres} />;
}
