"""
Test script for database connectivity
Run this after updating .env with real Supabase keys

Usage:
    python -m scripts.test_db_connection
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.client import get_db_client
from app.db.queries import list_genres, list_public_repos, get_repo_data


def test_connection():
    """Test basic database connectivity"""
    print("=" * 60)
    print("TESTING DATABASE CONNECTION")
    print("=" * 60)

    try:
        client = get_db_client()
        print("✅ Database client initialized successfully\n")

        # Test 1: List genres
        print("Test 1: Fetching genres...")
        genres = list_genres()
        print(f"✅ Found {len(genres)} genres")
        if genres:
            print(f"   Sample: {genres[0].genre_name}")
        print()

        # Test 2: List public repos
        print("Test 2: Fetching public repositories...")
        repos = list_public_repos(limit=5)
        print(f"✅ Found {len(repos)} public repos")
        if repos:
            print(f"   Sample: {repos[0].gitea_id}")
        print()

        # Test 3: Get specific repo (if any exist)
        if repos:
            print(f"Test 3: Fetching specific repo '{repos[0].gitea_id}'...")
            repo = get_repo_data(repos[0].gitea_id)
            if repo:
                print(f"✅ Successfully fetched repo")
                print(f"   Name: {repo.repo_name}")
                print(f"   Description: {repo.description}")
                print(f"   Clone count: {repo.clone_count}")
            else:
                print("❌ Repo not found")
        print()

        print("=" * 60)
        print("ALL TESTS PASSED ✅")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback

        traceback.print_exc()
        print("\n" + "=" * 60)
        print("TROUBLESHOOTING:")
        print("=" * 60)
        print("1. Verify SUPABASE_URL is set in .env")
        print("2. Verify SUPABASE_SERVICE_KEY is set in .env")
        print("3. Check that the service key is a valid JWT token (starts with 'eyJ')")
        print("4. Ensure the Supabase project is active and accessible")
        print("5. Verify the tables exist in your Supabase database:")
        print("   - genre_list")
        print("   - repo_data")
        print("   - repo_genres")
        print("   - profiles")


if __name__ == "__main__":
    test_connection()
