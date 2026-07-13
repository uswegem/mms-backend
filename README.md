# MMS Backend (NestJS)

Enterprise-grade API: Clean Architecture · DDD · CQRS · JWT · RBAC · Audit · Swagger · Prisma · PostgreSQL · Docker.

**Status:** Project structure and infrastructure shells only — **no bounded-context business logic yet.**

See [ARCHITECTURE.md](./ARCHITECTURE.md) for layer rules and module map.

## Quick start
cp .env.example .env   # fill DATABASE_URL + DIRECT_DATABASE_URL (Supabase)
npm install
npm run db:setup       # extensions → schema push → seed admin user
npm run start:dev
```

**Supabase:** use port **6543** (`?pgbouncer=true`) for `DATABASE_URL` (runtime) and port **5432** for `DIRECT_DATABASE_URL` (migrations). Do not run `prisma db push` on the transaction pooler — it will hang.

- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/api/docs`
- Health: `http://localhost:3001/api/v1/health`

### Seed admin (after `db:setup`)

| Field | Value |
|-------|-------|
| Email | `admin@mms.local` |
| Password | `Admin@12345678` |

### Auth endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | Returns `accessToken`; sets `refreshToken` httpOnly cookie |
| POST | `/auth/refresh` | Cookie-based rotation |
| POST | `/auth/logout` | Bearer + cookie |
| POST | `/auth/password/forgot` | Dev: logs `resetToken` |
| POST | `/auth/password/reset` | Token + new password (min 12, strong) |
| POST | `/auth/mfa/setup` | Authenticated — returns TOTP secret + QR |
| POST | `/auth/mfa/verify` | Enables MFA after setup |

## Docker
docker compose up -d    # Postgres + Redis + RabbitMQ (local)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Dev server |
| `npm run prisma:generate` | Prisma client |
| `npm run db:setup` | Extensions + push schema + seed |
| `npm run db:push` | Push Prisma schema (uses `DIRECT_DATABASE_URL`) |
| `npm run db:test` | Check DB connectivity + auth tables |
| `npm run db:pull` | Introspect DB into schema |