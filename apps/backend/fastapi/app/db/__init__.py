"""
Database layer for Supabase operations
Provides client initialization and query functions for existing Supabase tables
"""
from .client import get_db_client

__all__ = ["get_db_client"]
