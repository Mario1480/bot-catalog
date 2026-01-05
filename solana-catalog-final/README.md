# Solana Token-Gated Product Catalog

A production-ready Solana dApp that provides a **token-gated product catalog** with admin management, CSV import/export, image hosting on a VPS, and price-based access control via CoinGecko.

---

## ✨ Features

### User
- Connect Solana wallet (Phantom)
- Message signing (non-custodial login)
- Token-gated access
- Product search & filters
- External product links

### Admin
- Secure admin login
- Create & edit products
- Upload product images
- CSV import / export
- Configure token gating rules:
  - Required token mint
  - Minimum token amount **or**
  - Minimum USD value
  - ±2% price tolerance

### Infrastructure
- Dockerized (Web, API, DB, Redis)
- Images stored on VPS (Docker volume)
- Nginx reverse proxy
- HTTPS via Let’s Encrypt
- Firewall hardened (UFW)

---

## 🧱 Tech Stack

| Layer | Tech |
|-----|-----|
Frontend | Next.js (React, TypeScript)
Backend | Node.js (Express, TypeScript)
Blockchain | Solana RPC
Database | PostgreSQL
Cache | Redis
Auth | JWT + Solana message signing
Pricing | CoinGecko API
Infra | Docker, Nginx, Hostinger VPS

---

## 📂 Project Structure

```
solana-catalog-final/
├─ apps/
│  ├─ web/
│  └─ api/
├─ docker-compose.yml
├─ .env.example
├─ README.md
```

---

## ⚙️ Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

---

## 🐳 Docker Setup

```bash
docker compose --env-file .env -f docker-compose.yml up -d --build
```

---

## 🌐 Production Domains

- Frontend: https://app.utrade.vip
- API: https://api.utrade.vip
- Admin: https://app.utrade.vip/admin/login

---

## 🔐 Firewall (UFW)

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw deny 3000
ufw deny 4000
```

---

## 🖼️ Image Hosting

Images are stored in a Docker volume and served by Nginx.

```
/var/lib/docker/volumes/solana-catalog-final_api_uploads/_data/
```

---

## 👤 Admin Setup

Generate bcrypt hash and insert admin user into database.

---

## 🔑 Tokengate Logic

Wallet signature → balance check → CoinGecko price → access decision (±2%).

---

## 📄 License

MIT
