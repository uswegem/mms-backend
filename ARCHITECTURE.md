# MMS Backend — Enterprise Architecture

NestJS backend structured for **Clean Architecture**, **DDD**, and **CQRS**.  
This document describes the **folder layout only** — bounded-context modules are registered but not implemented.

## Layer model

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation (HTTP)     controllers, DTOs, guards            │
├─────────────────────────────────────────────────────────────┤
│  Application (Use cases) commands, queries, handlers, events│
├─────────────────────────────────────────────────────────────┤
│  Domain                  entities, VOs, events, repo ports    │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure          Prisma, JWT, audit, adapters       │
└─────────────────────────────────────────────────────────────┘
         ▲                              │
         │         depends inward       ▼
    shared/ (kernel)              PostgreSQL, Redis, RabbitMQ
```

**Dependency rule:** `modules/*` → `shared/*` only. Domain never imports NestJS or Prisma.

## CQRS

| Artifact | Location |
|----------|----------|
| Commands | `modules/{context}/application/commands/` |
| Queries | `modules/{context}/application/queries/` |
| Handlers | `modules/{context}/application/handlers/` |
| Bus | `@nestjs/cqrs` — registered in `app.module.ts` |

## Cross-cutting infrastructure

| Concern | Path |
|---------|------|
| Prisma / PostgreSQL | `infrastructure/database/prisma/` |
| JWT + Refresh tokens | `infrastructure/auth/jwt/`, `refresh-token/` |
| RBAC | `infrastructure/auth/rbac/` |
| Audit logging | `infrastructure/audit/` |
| Swagger | `infrastructure/swagger/` |
| Health | `infrastructure/health/` |
| Config | `infrastructure/config/` |

## Bounded contexts (`src/modules/`)

Aligned with `Architecture/Module-Breakdown.md`:

| Folder | BRD module |
|--------|------------|
| `identity` | Authentication, User Management |
| `authorization` | Authorization (RBAC policies) |
| `merchants` | Merchant Management |
| `merchant-onboarding` | Merchant Onboarding |
| `qr` | QR Management |
| `alias` | Alias Merchant ID |
| `school-fees` | School Fee Collection |
| `transactions` | Transactions |
| `settlements` | Settlement |
| `reconciliation` | Reconciliation |
| `reporting` | Reporting |
| `dashboard` | Dashboard |
| `notifications` | Notifications |
| `maker-checker` | Maker-Checker |
| `configuration` | Configuration |
| `tips` | TIPS Integration |
| `cbs` | CBS Integration |
| `monitoring` | Monitoring |

Each context follows:

```
modules/{context}/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   └── repositories/     # ports (interfaces)
├── application/
│   ├── commands/
│   ├── queries/
│   ├── handlers/
│   └── events/
├── infrastructure/
│   ├── persistence/
│   ├── mappers/
│   └── adapters/
├── presentation/
│   ├── http/controllers/
│   └── dto/
└── {context}.module.ts
```

## Implementation phases (not started)

1. **Identity** — login, refresh rotation, JWT guards  
2. **Authorization** — roles, permissions, `@Roles()`  
3. **Audit** — interceptor + `audit_logs` persistence  
4. **Domain modules** — merchants, transactions, … per OpenAPI  

## Path aliases

| Alias | Maps to |
|-------|---------|
| `@shared/*` | `src/shared/*` |
| `@infrastructure/*` | `src/infrastructure/*` |
| `@modules/*` | `src/modules/*` |
