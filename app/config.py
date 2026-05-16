from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Provedor de IA (qualquer API compatível com OpenAI)
    ai_api_key: str
    ai_base_url: str
    ai_model: str

    # Redis
    redis_url: str = "redis://redis:6379"

    # App
    app_env: str = "production"
    app_domain: str
    allow_localhost: bool = False

    # Limites
    rate_limit_por_dia: int = 3
    max_chars_sonho: int = 500
    max_chars_total: int = 3000
    max_mensagens_historico: int = 25

    class Config:
        env_file = ".env"


settings = Settings()
