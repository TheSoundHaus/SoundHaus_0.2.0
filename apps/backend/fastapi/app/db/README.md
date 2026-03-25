# Database Layer - Supabase Integration

This module provides database connectivity and query functions for existing Supabase tables.

## Overview

The SoundHaus backend uses Supabase for two purposes:
1. **Authentication** - Handled by `app/services/auth_service.py`
2. **Database** - Handled by this `app/db/` module

This database layer connects to existing Supabase PostgreSQL tables that store repository metadata, genres, user profiles, and activity tracking.

## Files

- `client.py` - Supabase database client singleton initialization
- `models.py` - Pydantic models matching Supabase table schemas
- `queries.py` - Reusable query functions for CRUD operations
- `README.md` - This file

## Supported Tables

### Core Tables
- `repo_data` - Repository metadata cache (from Gitea)
- `genre_list` - Available music genres
- `repo_genres` - Repository-to-genre associations (many-to-many)
- `profiles` - Extended user profile information

### Activity Tracking
- `clone_events` - Repository clone tracking
- `push_events` - Git push events from webhooks
- `repository_events` - Repository lifecycle events

### Collaboration
- `collaborator_invitations` - Pending/accepted collaboration invites

### Webhooks
- `webhook_configs` - Gitea webhook configuration
- `webhook_deliveries` - Webhook delivery logs

## Usage

### Initialize Client

```python
from app.db.client import get_db_client

client = get_db_client()
```

### Query Examples

```python
from app.db.queries import list_public_repos, get_repo_genres, upsert_repo_data
from app.db.models import RepoData
from datetime import datetime

# List public repositories
repos = list_public_repos(limit=50, search="electronic")

# Get genres for a repository
genres = get_repo_genres("user123/summer-beats")

# Create/update repository data
repo = RepoData(
    gitea_id="user123/summer-beats",
    owner="user123",
    repo_name="summer-beats",
    description="Electronic summer mix",
    private=False,
    created_at=datetime.utcnow(),
    updated_at=datetime.utcnow(),
    clone_count=0
)
upsert_repo_data(repo)
```

## Environment Variables Required

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # JWT token from Supabase dashboard
```

**Note**: The service key must be a valid Supabase service role key (JWT token, ~200+ characters).

## Testing

Run the test script to verify connectivity:

```bash
cd /apps/backend/fastapi
python -m scripts.test_db_connection
```

This will:
1. Initialize the database client
2. Test fetching genres
3. Test fetching public repositories
4. Test fetching a specific repository

## Next Steps (Remaining Branches)

### Branch 2: Genre Endpoints
- Create `/app/routers/genres.py`
- Implement `GET /api/genres` (list all genres)
- Implement `GET /api/genres/repos/{owner}/{repo}` (get repo genres)
- Implement `POST /api/genres/repos/{owner}/{repo}` (set repo genres)

### Branch 3: Public Repos Hybrid Endpoint
- Update `RepoService` with hybrid methods
- Create `GET /repos/public` endpoint
- Combine Supabase metadata with Gitea live data

### Branch 4: Sync Worker
- Create background worker to sync Gitea → Supabase
- Implement initial sync script
- Set up scheduled sync job

### Branch 5: Frontend Integration
- Wire frontend Explore page to new endpoints
- Create transform functions for data shape
- Remove mock data

## Troubleshooting

### "Invalid API key" Error
- Verify `.env` has real Supabase keys (not placeholders)
- Service key should be a long JWT token starting with "eyJ"
- Get keys from: Supabase Dashboard → Settings → API

### "Table does not exist" Error
- Verify tables exist in Supabase database
- Check table names match exactly (case-sensitive)
- Run table creation migrations if needed

### Connection Timeout
- Check SUPABASE_URL is correct
- Verify network connectivity to Supabase
- Check Supabase project is active (not paused)

## Architecture Notes

- **Singleton pattern**: Database client is initialized once and reused
- **Upsert operations**: Use `on_conflict` for idempotent insert/update
- **Error handling**: All query functions catch exceptions and return None/empty list
- **Type safety**: Pydantic models validate data before insertion
- **Separation of concerns**: Database layer is independent of API routes
