# Local Finance

A self-hosted app for turning bank statement PDFs into structured, searchable transactions. Upload a statement, review the extracted rows side-by-side with the original PDF, assign categories, and analyse spending across statements and time.

Currently tuned for ANZ statement formats. Single-user, no authentication required.

For architecture and design details see [DESIGN.md](DESIGN.md).

---

## Run locally (no configuration needed)

```bash
git clone <repo>
cd local-finance
docker compose up --build
```

Open **http://localhost:8080**.

That's it. The development override (`docker-compose.override.yml`) is applied automatically and supplies all defaults — no `.env` file is required.

> The first PDF upload can be slow because [Docling](https://github.com/DS4SD/docling) downloads its table-extraction models on demand (~1 GB). Subsequent uploads are fast.

Other ports exposed locally:

| Service | URL |
|---|---|
| App (nginx) | http://localhost:8080 |
| Backend API + Swagger | http://localhost:8000/docs |
| Postgres | `localhost:5432` |

---

## Deploy on your own server

### Prerequisites

- A Linux server with Docker and Docker Compose installed
- A domain name pointed at the server's IP
- SSL certificates for that domain (e.g. via [Certbot](https://certbot.eff.org/))

### 1. Clone and configure

```bash
git clone <repo>
cd local-finance
cp .env.example .env
```

Edit `.env` and set at minimum:

```dotenv
DOMAIN=finance.yourdomain.com
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql+asyncpg://finance:<strong-random-password>@postgres:5432/finance
```

Generate a strong password with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

### 2. Obtain SSL certificates

```bash
sudo certbot certonly --standalone -d finance.yourdomain.com
```

Certbot stores certificates under `/etc/letsencrypt/live/<domain>/` by default, which is where the nginx config expects them. If you store them elsewhere, set `LETSENCRYPT_DIR` in `.env`.

### 3. Start the stack

```bash
docker compose -f docker-compose.yml up --build -d
```

The `-f docker-compose.yml` flag skips the local development override so the production nginx config (HTTPS, port 443) is used instead.

The app will be available at `https://finance.yourdomain.com`.

### Certificate renewal

Certbot auto-renews certificates. After renewal, reload nginx to pick up the new cert:

```bash
docker compose exec nginx nginx -s reload
```

You can automate this with a post-renewal hook in `/etc/letsencrypt/renewal-hooks/deploy/`.

---

## Develop locally (without Docker)

Faster edit/reload cycles for backend or frontend work.

### Postgres (via Docker)

```bash
docker compose up postgres
```

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Frontend runs on http://localhost:3000.

---

## Configuration reference

Production deployments use a `.env` file. Local dev works without one (defaults are wired in `docker-compose.override.yml`).

| Variable | Local default | Description |
|---|---|---|
| `DOMAIN` | *(not used locally)* | Your public domain name — used by nginx and CORS |
| `POSTGRES_PASSWORD` | `localdev` | Postgres password |
| `DATABASE_URL` | `postgresql+asyncpg://finance:localdev@postgres:5432/finance` | Backend DB connection string |
| `PDF_STORAGE_PATH` | `/data/pdfs` | Where uploaded PDFs are stored inside the container |
| `LETSENCRYPT_DIR` | `/etc/letsencrypt` | Host path to Let's Encrypt certificate directory |
| `CLASSIFICATION_MIN_SIMILARITY` | `0.30` | Minimum trigram similarity for auto-classification |
| `CLASSIFICATION_K` | `3` | Number of nearest examples used in similarity voting |

When running the frontend outside Docker, set `NEXT_PUBLIC_API_URL` to the backend URL (e.g. `http://localhost:8000`). This value is baked into the Next.js bundle at build time.
