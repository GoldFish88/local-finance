from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv
import os

load_dotenv()  # Load environment variables from .env file


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    classification_min_similarity: float = 0.3
    classification_k: int = 3
    database_url: str = os.getenv("DATABASE_URL", "")
    pdf_storage_path: str = "/data/pdfs"
    # Comma-separated list of allowed CORS origins.
    # Defaults to localhost for local dev; extend via CORS_ORIGINS env var.
    cors_origins: str = "http://localhost:3000"


settings = Settings()
