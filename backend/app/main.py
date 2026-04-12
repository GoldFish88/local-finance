from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.db import get_db
from app.routers import extract
from app.routers import uploads
from app.routers import categories


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Docling warms up lazily on first upload (background task)
    # No blocking work here so the server is responsive immediately
    yield


app = FastAPI(title="local-finance", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extract.router)
app.include_router(uploads.router)
app.include_router(categories.router)


@app.get("/health")
async def health():
    db_status = await _check_db()
    return {
        "status": "ok",
        "db": db_status,
    }


async def _check_db() -> dict:
    try:
        async for session in get_db():
            await session.execute(text("SELECT 1"))
        return {"connected": True}
    except Exception as exc:
        return {"connected": False, "error": str(exc)}
