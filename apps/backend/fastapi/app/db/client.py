"""
Supabase database client initialization
Separate from auth service - this client is for database operations on custom tables
"""
import os
from supabase import create_client, Client
from typing import Optional

_db_client: Optional[Client] = None


def get_db_client() -> Client:
    """
    Get or create Supabase database client singleton
    Uses service key for full database access

    Returns:
        Supabase Client instance

    Raises:
        ValueError: If SUPABASE_URL or SUPABASE_SERVICE_KEY not configured
    """
    global _db_client

    if _db_client is None:
        url = os.getenv("SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_KEY")

        if not url:
            raise ValueError("SUPABASE_URL environment variable not set")
        if not service_key:
            raise ValueError("SUPABASE_SERVICE_KEY environment variable not set")

        _db_client = create_client(url, service_key)
        print("[DB Client] Supabase database client initialized")

    return _db_client


def reset_db_client() -> None:
    """Reset the database client singleton (useful for testing)"""
    global _db_client
    _db_client = None
