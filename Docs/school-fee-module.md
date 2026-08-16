# School Fee Collection Module (Milestone 4a)

Workflow for academic configuration, fee structures, student registry extensions, invoicing, and mock payment collection. **No real TIPS/CBS integration** — payments go through `PaymentGatewayInterface`; M3 replaces the mock provider only.

## Architecture reuse (M2)

| Concern | Reuse |
|---------|--------|
| School identity | `Merchant.isSchool` + `School` profile |
| Student Lipa Namba / static QR | Existing `StudentAliasService` / `StudentsController` (unchanged) |
| Dynamic invoice QR | `QrService.generateDynamic` with `bill_number` = payment reference |
| RBAC | New `school:fee:*`, `school:invoice:*`, `school:payment:*` permissions |
| Isolation | `SchoolAccessService` + `MerchantScopeService` on new endpoints |
| Audit | `AuditLogService.record` on publish, invoice, payment, waive, cancel |
| Money | `Decimal(18,2)` — never floats |

## ERD (logical)

```
Merchant (isSchool)
  ├── AcademicYear ── AcademicTerm
  ├── ClassLevel
  ├── Student ── StudentEnrollment (year + class)
  ├── FeeStructure (year + term + class + version) ── FeeStructureItem
  ├── FeeInvoiceSequence
  ├── FeeInvoice ── FeeInvoiceLine
  │                 ├── FeeInvoiceAdjustment
  │                 └── FeePayment (gatewayTxnRef UNIQUE)
  └── StudentAccountCredit (overpayments)
```

## Fee structure state machine

```
DRAFT ──publish──► PUBLISHED ──archive──► ARCHIVED
  ▲                    │
  │                    │ amend (clone → new DRAFT v+1)
  └────────────────────┘
```

**Rules**

- Only **PUBLISHED** structures can generate invoices.
- Publishing a structure **auto-archives** any other PUBLISHED row for the same year + term + class (one live published version).
- **Amend published**: clone items into a new DRAFT with `version + 1`; edit; publish (supersedes prior).
- Structures with invoices **cannot be deleted** — archive only.
- Existing invoices keep their line snapshot; they are not rewritten when a new version publishes.

## Invoice state machine

```
UNPAID ──partial pay──► PARTIALLY_PAID ──full pay──► PAID
   │            │                         ▲
   │            └─────────────────────────┘
   └──cancel──► CANCELLED (reason required; blocked if amountPaid > 0)

Derived: isOverdue (dueDate passed + balance > 0)
         isLatePayment (payment after academicTerm.endsOn)
```

## Payment gateway contract (M3 must implement)

```ts
interface PaymentGatewayInterface {
  validateReference(reference: string): Promise<unknown>;
  initiatePayment(input: {
    paymentReference: string;
    amount: string;
    outcome?: 'success' | 'failure' | 'pending';
  }): Promise<GatewayNotification>;
  getPaymentStatus(gatewayTxnRef: string): Promise<GatewayNotification | undefined>;
  handlePaymentNotification(payload: GatewayNotification): Promise<GatewayNotification>;
}
```

Nest token: `PAYMENT_GATEWAY`. Current provider: `MockPaymentGateway`.

Fee module applies money only via `InvoicePaymentService.applyFromGatewayNotification` (transactional, `FOR UPDATE`, idempotent on `gatewayTxnRef`).

**Edge cases**

| Case | Behavior |
|------|----------|
| Duplicate `gatewayTxnRef` | Ignore; audit `FEE_PAYMENT_DUPLICATE_IGNORED` |
| Cancelled invoice | Reject with clear error |
| Overpayment | Apply to invoice; excess → `StudentAccountCredit` |
| After term end | Accept; set `isLatePayment` |

## Roles

| Role | Fee structures | Invoices / students | Payments |
|------|----------------|---------------------|----------|
| `SCHOOL_ADMIN` | Read/write **own school** | Full own school | Read + mock |
| Platform (`BANK_ADMIN` / Ops) | **Read only** | Read | Read |
| `SUPER_ADMIN` | All (seed) | All | All |

## API endpoints

Base: `/api/v1`

### Academic (`school:fee:read|write`)

| Method | Path |
|--------|------|
| GET/POST | `/schools/:merchantId/academic-years` |
| PATCH | `/schools/:merchantId/academic-years/:id` |
| GET/POST | `/schools/:merchantId/terms` |
| PATCH | `/schools/:merchantId/terms/:id` |
| GET/POST | `/schools/:merchantId/class-levels` |
| PATCH | `/schools/:merchantId/class-levels/:id` |

### Fee structures (`school:fee:read|write`)

| Method | Path |
|--------|------|
| GET/POST | `/schools/:merchantId/fee-structures` |
| GET/PATCH/DELETE | `/schools/:merchantId/fee-structures/:id` |
| POST | `/schools/:merchantId/fee-structures/:id/publish` |
| POST | `/schools/:merchantId/fee-structures/:id/archive` |
| POST | `/schools/:merchantId/fee-structures/:id/amend` |

### Student registry (extends M2; M2 enrol routes unchanged)

| Method | Path |
|--------|------|
| GET | `/schools/:merchantId/registry/students` |
| GET/PATCH | `/schools/:merchantId/registry/students/:studentId` |
| POST | `/schools/:merchantId/registry/students/:studentId/enroll` |
| POST | `/schools/:merchantId/registry/students/:studentId/promote` |
| POST | `/schools/:merchantId/registry/students/bulk-import` |

### Invoices

| Method | Path | Permission |
|--------|------|------------|
| GET | `/schools/:merchantId/fee-invoices` | invoice:read |
| GET | `/schools/:merchantId/fee-invoices/:id` | invoice:read |
| GET | `/schools/:merchantId/fee-invoices/totals/:classLevelId/:termId` | invoice:read |
| GET | `/schools/:merchantId/fee-invoices/students/:studentId/statement` | invoice:read |
| POST | `/schools/:merchantId/fee-invoices/generate` | invoice:write |
| POST | `/schools/:merchantId/fee-invoices/generate-class` | invoice:write |
| POST | `/schools/:merchantId/fee-invoices/:id/cancel` | invoice:cancel |
| POST | `/schools/:merchantId/fee-invoices/:id/adjustments` | invoice:waive |

### Payments (mock)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/school-fee-payments/lookup/:reference` | payment:read |
| POST | `/school-fee-payments/mock/initiate` | payment:mock |
| POST | `/school-fee-payments/mock/notify` | payment:mock |

## Demo seed

Run after base seed (or included in `npm run db:seed`):

```bash
npx ts-node --transpile-only prisma/seed-school-fees.ts
```

Creates/uses a demo ACTIVE school merchant with classes, ~20 students, published fee structure, invoices, and sample mock payments.

After upgrading from 4(a) legacy `REF-*` / `INV-*` formats:

```bash
npx prisma db execute --file prisma/m4b_references_additive.sql --schema prisma/schema.prisma
npx prisma generate
npx ts-node --transpile-only prisma/migrate-fee-references-m4b.ts
```

## Milestone 4(b) — Student & Invoice References

### Formats

| Type | Format | Example |
|------|--------|---------|
| Student reference | Existing Lipa Namba (8 digits + Damm) | `78012345` |
| Invoice number | `INV-{schoolSeq3}-{YYYY}{termSeq}-{seq6}` | `INV-042-20261-000123` |
| Payment / control | `9` + schoolSeq3 + seq8 + Damm (**13 digits**) | `9042000001234` |

Immutable once issued. Cancel + new invoice is the only regeneration path. Generation is centralized in `ReferenceService` (row-locked sequences).

### Resolution

`ReferenceResolutionService.resolve(reference)` pipeline:

1. Format check (8 or 13 digits)
2. Damm check digit
3. Existence (student alias or invoice control)
4. School status (ACTIVE vs SUSPENDED/inactive)
5. Lifecycle: cancelled / settled / active

Typed errors (M3 must map these): `INVALID_FORMAT`, `BAD_CHECK_DIGIT`, `NOT_FOUND`, `CANCELLED`, `SETTLED`, `SCHOOL_SUSPENDED`, `SCHOOL_INACTIVE`.

| Reference | Amount due | Payment allocation |
|-----------|------------|-------------------|
| Invoice control | That invoice outstanding | Single invoice |
| Student Lipa | Sum of open invoices | School setting `allocationRule` (default **oldest due date first**) |

### Reconciliation binding (`fee_payments`)

Permanent matching key for future TIPS/CBS/MMS reconciliation:

- `payment_reference` (as entered)
- `reference_type` (`INVOICE` \| `STUDENT`)
- `resolved_student_id` / `resolved_invoice_id`
- `amount_due_at_lookup` (snapshot)
- `gateway_txn_ref` (unique)
- Child rows in `fee_payment_allocations` (never lump-only for multi-invoice student pays)

### Lookup logging

`reference_lookup_logs` — success and failure, channel, timestamp. Indexed for support/recon; prunable.

### Endpoints (4b)

| Method | Path | Auth |
|--------|------|------|
| GET | `/channel/fee-references/:reference` | **Public** (payer-safe) |
| GET | `/school-fee-payments/lookup/:reference` | JWT + payment:read |
| GET | `/schools/:merchantId/fee-references/search?q=` | School-scoped |
| GET | `/schools/:merchantId/fee-references/:reference/trail` | School-scoped |
| GET | `/schools/:merchantId/fee-invoices/:id/payment-slip.pdf` | PDF slip |
| GET | `/admin/fee-references/search?q=` | Platform read |
| GET | `/admin/fee-references/:reference/trail` | Platform read |

## Milestone 4(c) — Payment Tracking + Reconciliation

### Payment lifecycle

```
INITIATED → PENDING → COMPLETED → REVERSED
                     COMPLETED → DISPUTED → COMPLETED | REVERSED | FAILED
INITIATED | PENDING → FAILED
```

Completed payments are never edited; corrections use **reversals** (unwind allocations + restore invoice balances + audit).

Timestamps: `gatewayPaidAt` (external) vs `mmsReceivedAt` (MMS). Matching uses 4(b) binding tuple; allocations untouched by recon.

### Daily snapshots

`school_daily_collection_snapshots` — immutable per school/day (collected, count, by-channel, outstanding). Cron `15 1 * * *` via `@nestjs/schedule`.

### Settlement CSV contract (M3 must produce)

```
source,external_txn_id,payment_reference,amount,currency,value_date,payer_msisdn,payer_name,status
```

Idempotent on `(source, external_txn_id)` and file hash.

### Matching priority

1. `external_txn_id == gateway_txn_ref` → `MATCHED`
2. ref + amount within soft ±N days (default 1) → `MATCHED`
3. ref + amount within hard ±M days (default 3) → `MATCHED_WITH_VARIANCE`
4. ref + amount beyond hard → `DATE_VARIANCE_REVIEW` (no claim; exception)
5. ref + amount mismatch → `AMOUNT_MISMATCH`
6. else → `UNMATCHED_EXTERNAL`
+ MMS completed with no external → `UNMATCHED_INTERNAL`

### Endpoints (4c)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/schools/:id/payment-ledger` | payment:read |
| GET | `/platform/school-fee-payments` | payment:read |
| GET | `/schools/:id/payment-ledger/:paymentId` | payment:read |
| POST | `/schools/:id/payment-ledger/:paymentId/reverse` | payment:reverse |
| GET | `/schools/:id/payment-ledger/daily-summary?date=` | payment:read |
| GET | `/schools/:id/payment-ledger/students/:studentId/statement` | payment:read |
| POST | `/reconciliation/ingest` | recon:ingest |
| GET | `/reconciliation/batches` | recon:read |
| POST | `/reconciliation/runs` | recon:run |
| GET | `/reconciliation/runs` | recon:read |
| GET | `/reconciliation/runs/:id` | recon:read |
| GET | `/reconciliation/schools/:id/summary` | recon:read |
| POST | `/reconciliation/sim-feed` | recon:run |

Apply DB: `npx prisma db execute --file prisma/m4c_recon_additive.sql`

## Out of scope (later milestones)

- Real TIPS/CBS (M3)
- Analytics dashboards (M5)
- SMS/email providers (hooks only)

## Milestone 4(d) — Exception handling

### Case lifecycle

```
OPEN → UNDER_INVESTIGATION → PENDING_APPROVAL → RESOLVED → CLOSED
  └→ ESCALATED → …
AUTO_CLOSED (dedup / superseded)
```

Cases are fingerprint-deduped across runs (`classification` + merchant + payment/external IDs). SLA due timestamps are stored (`exceptionSlaHours`, default 48h) — hooks only for notifications.

### Resolution actions

| Action | Financial | Notes |
|--------|-----------|--------|
| MANUAL_MATCH | Yes | Creates manual `ReconciliationMatch` (unique payment/external still enforced) |
| FORCE_CREATE_PAYMENT | Yes | Via `InvoicePaymentService.applyFromGatewayNotification` only |
| REVERSE_PAYMENT | Yes | Via `PaymentLedgerService.reversePayment` |
| WRITE_OFF | Yes | `reconciliation_write_offs` row |
| BANK_SIDE_ERROR | No | Sets `excludeFromMatching` on external row(s) |
| ESCALATE | No | Status → ESCALATED |

Financial actions create `ApprovalTask` with `entityType=RECON_EXCEPTION` (self-approve blocked). Checker approve/reject callbacks execute or reopen the case.

### Endpoints (4d)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/reconciliation/exceptions` | recon:exception:read |
| GET | `/reconciliation/exceptions/:id` | recon:exception:read |
| POST | `/reconciliation/exceptions/:id/resolve` | recon:exception:resolve |
| GET | `/reconciliation/schools/:id/exceptions` | recon:read (sanitized) |
| GET | `/reconciliation/schools/:id/exceptions/:caseId` | recon:read (sanitized) |

## Milestone 4(e) — Three-way matching

### Match groups (Option A)

`ReconciliationMatchGroup` + `ReconciliationMatchGroupLeg` (MMS / TIPS / CBS). Existing `ReconciliationMatch` two-way unique constraints remain; three-way uses groups for CBS↔TIPS↔MMS composition.

Statuses: `FULLY_MATCHED`, `MMS_TIPS_ONLY`, `MMS_CBS_ONLY`, `TIPS_CBS_ONLY`, `MMS_ONLY`, `TIPS_ONLY`, `CBS_ONLY`, `CONFLICT`.

### Date variance

- Soft ±1 day → auto `MATCHED` (ref+amount)
- Soft..hard (±3d) → auto `MATCHED_WITH_VARIANCE`
- Beyond hard → `DATE_VARIANCE_REVIEW` (candidate only; exception opened)

### CSV specs

**TIPS:** `source,external_txn_id,payment_reference,amount,currency,value_date,payer_msisdn,payer_name,status`

**CBS:** `source,external_txn_id,tips_txn_id,payment_reference,amount,currency,value_date,credit_account,narration,status`

### Run order

1. TIPS↔MMS via `decideMatch` (4c rules)
2. CBS↔TIPS (`tips_txn_id`) / CBS↔MMS; cross-leg amount consistency
3. Bulk CBS (`narration` contains BULK) → exception `BULK_SUM_MISMATCH` (no silent auto-bind)
4. Open 4(d) cases for non-fully-matched groups

Start a three-way run with `POST /reconciliation/runs` and `threeWay: true` (or omit `source`).

Apply DB: `npx prisma db execute --file prisma/m4de_exception_threeway_additive.sql`
