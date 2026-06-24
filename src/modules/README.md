# Bounded contexts

Each folder is a **DDD bounded context** with four layers. Business logic is **not implemented yet**.

| Module | BRD area |
|--------|----------|
| `identity` | Login, users, JWT flows |
| `authorization` | Role/permission assignment |
| `merchants` | Merchant CRUD & lifecycle |
| `merchant-onboarding` | KYC / onboarding workflow |
| `qr` | TANQR QR issuance |
| `alias` | Alias merchant IDs |
| `school-fees` | School fee invoices |
| `transactions` | Payments / TIPS callbacks |
| `settlements` | Settlement batches |
| `reconciliation` | Recon runs & exceptions |
| `reporting` | Report jobs |
| `dashboard` | KPI aggregates |
| `notifications` | SMS / email / in-app |
| `maker-checker` | Approval tasks |
| `configuration` | System config & flags |
| `tips` | TIPS adapter |
| `cbs` | CBS posting adapter |
| `monitoring` | Health metrics & alerts |

## Adding a feature (later)

1. **Domain** — entity, value objects, repository interface  
2. **Application** — command/query + handler (`@nestjs/cqrs`)  
3. **Infrastructure** — Prisma repository, mappers  
4. **Presentation** — controller + DTOs + Swagger decorators  
5. Register handler & controller in `{context}.module.ts`
