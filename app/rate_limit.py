from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[],
)

# Chave Redis para contagem diária de vereditos por IP
_KEY_PREFIX = "rate:sonho:"


async def checar_limite_veredito(redis, ip: str) -> int:
    key = f"{_KEY_PREFIX}{ip}"
    count = await redis.get(key)
    return int(count) if count else 0


async def incrementar_veredito(redis, ip: str) -> None:
    key = f"{_KEY_PREFIX}{ip}"
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, 86400)  # TTL de 24h
    await pipe.execute()
