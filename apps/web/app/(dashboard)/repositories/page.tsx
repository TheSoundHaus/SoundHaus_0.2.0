import { getMyRepos } from "@/lib/api/repos";
import RepositoriesClient from "./RepositoriesClient";
import type { GiteaRepo } from "@/lib/types/api";

export default async function RepositoriesPage() {
  const result = await getMyRepos();

  const repos: GiteaRepo[] = result.success ? result.data : [];

  return <RepositoriesClient repos={repos} />;
}
