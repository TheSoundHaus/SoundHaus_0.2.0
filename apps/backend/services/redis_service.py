"""
Redis client singleton — shared connection pool for all services.
"""

import redis.asyncio as aioredis
from config import settings

_pool: aioredis.ConnectionPool | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.redis_url,
            max_connections=20,
            decode_responses=True,
        )
    return aioredis.Redis(connection_pool=_pool)


async def close_redis():
    global _pool
    if _pool:
        await _pool.disconnect()
        _pool = None
