# Backend project structure

```
Backend/
├── ARCHITECTURE.md
├── STRUCTURE.md
├── README.md
├── docker-compose.yml
├── Dockerfile
├── prisma/
│   └── schema.prisma
└── src/
    ├── main.ts
    ├── app.module.ts
    │
    ├── shared/                          # Shared kernel (DDD + CQRS contracts)
    │   ├── domain/
    │   ├── application/
    │   └── presentation/
    │
    ├── infrastructure/                  # Adapters (global)
    │   ├── config/
    │   ├── database/prisma/
    │   ├── auth/
    │   │   ├── jwt/
    │   │   ├── refresh-token/
    │   │   ├── rbac/
    │   │   └── strategies/
    │   ├── audit/
    │   ├── swagger/
    │   ├── health/
    │   ├── cache/
    │   ├── queue/
    │   ├── integrations/supabase/
    │   └── infrastructure.module.ts
    │
    └── modules/                           # Bounded contexts (18)
        ├── modules.module.ts
        ├── identity/
        ├── authorization/
        ├── merchants/
        ├── merchant-onboarding/
        ├── qr/
        ├── alias/
        ├── school-fees/
        ├── transactions/
        ├── settlements/
        ├── reconciliation/
        ├── reporting/
        ├── dashboard/
        ├── notifications/
        ├── maker-checker/
        ├── configuration/
        ├── tips/
        ├── cbs/
        └── monitoring/
            └── {context}/
                ├── domain/
                ├── application/
                ├── infrastructure/
                ├── presentation/
                └── {context}.module.ts
```

Each bounded context uses the same four layers; implement commands/queries/handlers when building features.
