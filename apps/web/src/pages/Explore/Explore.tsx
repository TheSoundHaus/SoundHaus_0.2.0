import { useState, useEffect } from "react"
import { fetchPublicRepos, fetchGenres } from "@/lib/api/repos"
import type { PublicRepo, Genre } from "@/models/repo"

function ExplorePage() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Array of public repos to display
  const [repos, setRepos] = useState<PublicRepo[]>([])
  
  // Array of available genres for filtering
  const [genres, setGenres] = useState<Genre[]>([])
  
  // Currently selected genre filter (null = show all)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  
  // Loading state (true while fetching data)
  const [loading, setLoading] = useState<boolean>(true)
  
  // Error message if something goes wrong
  const [error, setError] = useState<string | null>(null)

  // ============================================================================
  // DATA FETCHING - GENRES (runs once on mount)
  // ============================================================================
  
  useEffect(() => {
    const loadGenres = async () => {
      try {
        const genreList = await fetchGenres()
        setGenres(genreList)
      } catch(err) {
        console.error("Failed to fetch genres: ", err)
      }
    }
    
    loadGenres()

    // TODO: Create an async function to fetch genres
    // TODO: Call fetchGenres() from your API
    // TODO: Update genres state with the result
    // TODO: Handle errors with try/catch
    
  }, []) // Empty array = runs once when component mounts

  // ============================================================================
  // DATA FETCHING - REPOS (runs when selectedGenre changes)
  // ============================================================================
  
  useEffect(() => {
    setLoading(true)
    setError(null)
    
    const loadReposData = async () => {
      try{
        const repoList = await fetchPublicRepos()
        setRepos(repoList)
      } catch(err) {
        setError('Failed to load repos. Please retry')
        console.log("Failed to load public repos: ", err)
      } finally {
        setLoading(false)
      }
    }
    
    loadReposData()

    // TODO: Set loading to true
    // TODO: Create an async function to fetch repos
    // TODO: Call fetchPublicRepos(selectedGenre or undefined)
    // TODO: Update repos state with the result
    // TODO: Set loading to false
    // TODO: Handle errors with try/catch
    
  }, [selectedGenre]) // Runs whenever selectedGenre changes

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  const handleGenreChange = (genreName: string) => {
    // TODO: Update selectedGenre state
    setSelectedGenre(genreName)
  }

  const handleClearFilter = () => {
    // TODO: Set selectedGenre back to null
    setSelectedGenre(null)
  }

  // ============================================================================
  // RENDER - LOADING STATE
  // ============================================================================
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  // ============================================================================
  // RENDER - ERROR STATE
  // ============================================================================
  
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER - MAIN UI
  // ============================================================================
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Explore</h1>
        <p className="text-gray-600">Discover music repos from the community</p>
      </div>

      {/* Genre Filter Section */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Filter by Genre</h2>
        <div className="flex flex-wrap gap-2">
          {/* TODO: "All" button to clear filter */}
          <button
            onClick={handleClearFilter}
            className={`px-4 py-2 rounded-full ${
              selectedGenre === null 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            All
          </button>

          {/* TODO: Map over genres array and create a button for each */}
          {/* TODO: Use handleGenreChange when clicked */}
          {/* TODO: Highlight the selected genre */}
          {genres.map((genre) => (
            <button
              key={genre.genre_id}
              onClick={() => handleGenreChange(genre.genre_name)}
              className={`px-4 py-2 rounded-full ${
                selectedGenre === genre.genre_name
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {genre.genre_name}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {repos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {selectedGenre 
              ? `No repos found for genre "${selectedGenre}"` 
              : 'No repos available yet'}
          </p>
        </div>
      )}

      {/* Repos Grid */}
      {repos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repos.map((repo) => (
            <div
              key={repo.gitea_id}
              className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              {/* Repo Header */}
              <div className="mb-3">
                <h3 className="text-lg font-semibold">{repo.name}</h3>
                <p className="text-sm text-gray-500">by {repo.owner}</p>
              </div>

              {/* Description */}
              {repo.description && (
                <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                  {repo.description}
                </p>
              )}

              {/* Genre Tags */}
              {repo.genres && repo.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {repo.genres.map((genre) => (
                    <span
                      key={genre.genre_id}
                      className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                    >
                      {genre.genre_name}
                    </span>
                  ))}
                </div>
              )}

              {/* Audio Player Placeholder */}
              {repo.audio_snippet && (
                <div className="mb-3">
                  <audio
                    controls
                    className="w-full h-8"
                    src={repo.audio_snippet}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}

              {/* Footer: Clone Count + Clone Button */}
              <div className="flex items-center justify-between pt-3 border-t">
                <span className="text-sm text-gray-500">
                  {repo.clone_count} {repo.clone_count === 1 ? 'clone' : 'clones'}
                </span>
                <button
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  onClick={() => {
                    // TODO: Implement clone functionality
                    // Call POST /repos/{owner}/{repo}/clone
                    console.log('Clone repo:', repo.gitea_id)
                    alert(`Clone URL: ${repo.clone_url}`)
                  }}
                >
                  Clone
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExplorePage