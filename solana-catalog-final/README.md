# Solana Token-Gated Product Catalog (Hostinger VPS)

This repo contains:
- `apps/api`: Express + TypeScript API (token gating, admin, products, CSV, local image upload, full-text search).
- `apps/web`: Next.js frontend (wallet connect, gated catalog, admin UI).
- `infra/sql`: Postgres migrations.
- `docker-compose.yml`: Local/VPS deployment (Postgres + Redis + API + Web).

## Quick start (Docker)
1. Copy env:
   ```bash
   cp .env.example .env