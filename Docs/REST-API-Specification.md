# MMS REST API Specification v1.0

| Artifact | Location |
|----------|----------|
| **OpenAPI 3.0 (machine-readable)** | `Docs/openapi/mms-api-v1.openapi.yaml` |
| **Regenerate OpenAPI** | `python Docs/openapi/generate_openapi.py` |
| **Module permissions** | `Architecture/Module-Breakdown.md` |

**Base URL:** `/api/v1`  
**Content-Type:** `application/json` (unless multipart)  
**Errors:** `application/problem+json` (RFC 7807)

---

## Global headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes* | `Bearer {accessToken}` — *except public/webhook routes |
| `X-Correlation-Id` | Recommended | UUID for distributed tracing |
| `Idempotency-Key` | Conditional | Required on payment-impacting `POST` (refunds, webhooks, CBS post) |

---

## Error code catalog

| Code | HTTP | Description |
|------|------|-------------|
| **MMS-40001** | 400 | Validation error — invalid request body/query |
| **MMS-40101** | 401 | Unauthorized — missing/invalid/expired token |
| **MMS-40301** | 403 | Forbidden — insufficient permission |
| **MMS-40401** | 404 | Resource not found |
| **MMS-40901** | 409 | Conflict — duplicate or illegal state transition |
| **MMS-42201** | 422 | Business rule violation |
| **MMS-42901** | 429 | Rate limit exceeded |
| **MMS-50001** | 500 | Internal server error |
| **MMS-AUTH-001** | 401 | Invalid credentials |
| **MMS-AUTH-002** | 423 | Account locked |
| **MMS-AUTH-003** | 401 | MFA required / invalid MFA code |
| **MMS-PAY-001** | 409 | Duplicate TIPS end-to-end ID |
| **MMS-PAY-002** | 401 | Invalid TIPS webhook signature |
| **MMS-MCH-001** | 422 | Merchant not active |
| **MMS-MCH-002** | 422 | Invalid MCC or postcode |
| **MMS-QR-001** | 422 | Invalid TANQR CRC/payload |
| **MMS-QR-002** | 422 | QR revoked or expired |
| **MMS-SET-001** | 422 | Settlement batch not approved |
| **MMS-ONB-001** | 422 | Incomplete KYC / onboarding |
| **MMS-ALIAS-001** | 422 | Invalid Lipa Namba checksum |

### Problem Details response shape

```json
{
  "type": "https://mms.example/errors/validation",
  "title": "Validation Failed",
  "status": 400,
  "code": "MMS-40001",
  "detail": "One or more fields are invalid",
  "correlationId": "581b314e-257f-41bf-bbdc-6384daa31d16",
  "errors": [
    { "field": "email", "message": "must be a valid email" }
  ]
}
```

---

## Endpoint index (137 routes)

Full request/response schemas, validations, and permissions are in **OpenAPI**. Summary below.

### 1. Authentication

| Method | Route | Permission | Validations | Error codes |
|--------|-------|------------|-------------|-------------|
| POST | `/auth/login` | public | email format, password min 8, optional mfaCode 6 digits | AUTH-001, AUTH-002, AUTH-003 |
| POST | `/auth/refresh` | public | refresh cookie | 40101 |
| POST | `/auth/logout` | auth:login | bearer token | 40101 |
| POST | `/auth/logout-all` | auth:session:revoke-all | bearer token | 40101 |
| POST | `/auth/mfa/setup` | auth:mfa:manage | authenticated user | 40101 |
| POST | `/auth/mfa/verify` | public | email, mfaCode | AUTH-003 |
| POST | `/auth/password/forgot` | public | email | — |
| POST | `/auth/password/reset` | public | token, newPassword min 12 | 40001 |
| POST | `/auth/token/client` | auth:client:manage | clientId, clientSecret | 40101 |

**Login response:** `{ accessToken, expiresIn, tokenType }` + `Set-Cookie: refreshToken` (httpOnly).

---

### 2. Authorization

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/authz/roles` | authz:role:read |
| POST | `/authz/roles` | authz:role:write |
| PUT | `/authz/roles/{id}` | authz:role:write |
| PUT | `/authz/roles/{id}/permissions` | authz:role:write |
| GET | `/authz/permissions` | authz:permission:read |
| GET | `/authz/me/permissions` | authz:me |
| GET | `/authz/users/{userId}/effective-permissions` | authz:role:read |

---

### 3. User Management

| Method | Route | Permission | Request highlights |
|--------|-------|------------|-------------------|
| GET | `/users` | user:read | page, limit |
| POST | `/users` | user:write | email, fullName, roleIds[] |
| GET | `/users/me` | user:read | — |
| GET | `/users/{id}` | user:read | — |
| PUT | `/users/{id}` | user:write | fullName, phone |
| POST | `/users/{id}/deactivate` | user:deactivate | — |
| POST | `/users/invite` | user:invite | email, roleId |
| PUT | `/users/{id}/roles` | user:role:assign | roleIds[] |

---

### 4. Merchant Management

| Method | Route | Permission | Validations |
|--------|-------|------------|-------------|
| GET | `/merchants` | merchant:read | status filter, q search |
| GET | `/merchants/{id}` | merchant:read | uuid |
| PUT | `/merchants/{id}` | merchant:write | tradingName≤100, city≤15, postalCode 5 digit, mcc 4 digit |
| POST | `/merchants/{id}/suspend` | merchant:suspend | active merchant |
| POST | `/merchants/{id}/reactivate` | merchant:suspend | suspended only |
| POST | `/merchants/{id}/close` | merchant:close | — |
| GET/POST | `/merchants/{id}/stores` | merchant:read / store:write | storeLabel≤25 |
| PUT | `/stores/{id}` | merchant:store:write | — |
| GET/POST | `/stores/{id}/terminals` | merchant:read / store:write | terminalLabel≤25 |
| PUT | `/merchants/{id}/limits` | merchant:limits:write | positive amounts |
| GET | `/merchants/{id}/documents` | merchant:read | — |

**Merchant response:** `Merchant` schema (id, legalName, tradingName, status, mcc, isSchool).

---

### 5. Merchant Onboarding

| Method | Route | Permission | Error codes |
|--------|-------|------------|-------------|
| GET/POST | `/onboarding/applications` | onboarding:read / write | — |
| GET/PUT | `/onboarding/applications/{id}` | read / write | — |
| POST | `/onboarding/applications/{id}/documents` | write | multipart file |
| POST | `/onboarding/applications/{id}/submit` | submit | ONB-001 |
| POST | `/onboarding/applications/{id}/aml-screen` | aml:trigger | — |
| POST | `/onboarding/applications/{id}/approve` | approve | ONB-001, triggers maker-checker |
| POST | `/onboarding/applications/{id}/reject` | reject | rejectionCode required |
| GET | `/onboarding/applications/{id}/timeline` | read | — |

---

### 6. QR Management (TANQR)

| Method | Route | Permission | Request | Response |
|--------|-------|------------|---------|----------|
| POST | `/qr/static` | qr:generate | merchantId | QrCode + payload |
| POST | `/qr/dynamic` | qr:generate | merchantId, amount>0, billNumber?, invoiceId? | QrCode |
| POST | `/qr/validate` | qr:validate | payload string | valid, crcValid |
| GET | `/qr/{id}` | qr:read | — | QrCode |
| GET | `/qr/{id}/download` | qr:read | — | presigned url |
| POST | `/qr/{id}/revoke` | qr:revoke | — | — |
| POST | `/qr/{id}/regenerate` | qr:regenerate | — | QrCode |
| GET | `/merchants/{id}/qr` | qr:read | — | QrCode[] |
| POST | `/qr/batch-print` | qr:generate | merchantIds[] | jobId |
| POST | `/qr/migrate` | qr:regenerate | legacyPayload | QrCode |

**Validations:** POI 11/12, CRC ISO13239, currency 834, country TZ, ID26 TIPS fields.

**Errors:** MMS-QR-001, MMS-QR-002

---

### 7. Alias Merchant ID (Lipa Namba)

| Method | Route | Permission | Validations |
|--------|-------|------------|-------------|
| GET | `/merchants/{id}/alias` | alias:read | 8 numeric digits |
| POST | `/merchants/{id}/alias/regenerate` | alias:regenerate | ops only |
| POST | `/alias/validate` | alias:validate | alias8digit pattern |
| GET | `/alias/lookup/{alias}` | alias:lookup | internal |

**Errors:** MMS-ALIAS-001

---

### 8. Transactions

| Method | Route | Permission | Notes |
|--------|-------|------------|-------|
| POST | `/webhooks/tips/payment` | transaction:webhook | HMAC header, Idempotency-Key, TipsPaymentWebhook body |
| GET | `/transactions` | transaction:read | filters: status, date, merchantId |
| GET | `/transactions/{id}` | transaction:read | Payment |
| GET | `/transactions/{id}/events` | transaction:read | timeline |
| POST | `/transactions/{id}/refund` | transaction:refund | amount?, reason |
| GET | `/merchants/{id}/transactions` | transaction:self:read | merchant scope |
| POST | `/transactions/export` | transaction:export | async jobId |

**Webhook request body:**
```json
{
  "endToEndId": "string",
  "amount": 50000.00,
  "currency": "TZS",
  "merchantId": "15-digit or routing id",
  "status": "SUCCESS",
  "billNumber": "optional",
  "referenceLabel": "optional",
  "completedAt": "2026-06-04T12:00:00Z"
}
```

**Errors:** MMS-PAY-001 (409), MMS-PAY-002 (401)

---

### 9. Settlement

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/settlements/batches` | settlement:read |
| POST | `/settlements/batches/generate` | settlement:generate |
| GET | `/settlements/batches/{id}` | settlement:read |
| GET | `/settlements/batches/{id}/lines` | settlement:read |
| POST | `/settlements/batches/{id}/submit` | settlement:submit |
| POST | `/settlements/batches/{id}/approve` | settlement:approve |
| POST | `/settlements/batches/{id}/reject` | settlement:approve |
| POST | `/settlements/batches/{id}/post` | settlement:post |
| GET | `/merchants/{id}/settlements` | settlement:self:read |

**Errors:** MMS-SET-001

---

### 10. Reconciliation

| Method | Route | Permission |
|--------|-------|------------|
| GET/POST | `/reconciliation/runs` | recon:read / recon:run |
| GET | `/reconciliation/runs/{id}` | recon:read |
| GET | `/reconciliation/runs/{id}/exceptions` | recon:read |
| POST | `/reconciliation/runs/{id}/close` | recon:close |
| PUT | `/reconciliation/exceptions/{id}` | recon:exception:resolve |
| GET | `/reconciliation/exceptions/export` | recon:read |

---

### 11. School Fee Collection

| Method | Route | Permission |
|--------|-------|------------|
| GET/PUT | `/schools/{merchantId}` | school:read / write |
| GET/POST | `/schools/{merchantId}/academic-years` | school:read / write |
| GET/POST | `/schools/{merchantId}/terms` | school:read / write |
| GET/POST | `/schools/{merchantId}/fee-items` | school:read / write |
| GET/POST | `/schools/{merchantId}/students` | school:student:read / write |
| POST | `/schools/{merchantId}/invoices` | school:invoice:write |
| POST | `/schools/{merchantId}/invoices/bulk` | school:invoice:write |
| GET | `/invoices/{id}` | school:read |
| POST | `/invoices/{id}/qr` | school:invoice:qr |
| POST | `/invoices/{id}/allocate` | school:write |
| GET | `/schools/{merchantId}/collections` | school:report:read |
| GET | `/students/{id}/statement` | school:statement:read |

---

### 12–20. Supporting modules

| Module | Key routes | OpenAPI tag |
|--------|------------|-------------|
| Approvals | `/approvals/tasks`, `/approvals/policies/{entityType}` | Approvals |
| Notifications | `/notifications/templates`, `/notifications/in-app` | Notifications |
| Reporting | `/reports/generate`, `/reports/jobs/{id}` | Reporting |
| Dashboard | `/dashboard/{acquirer\|operations\|finance\|merchant\|school}` | Dashboard |
| Audit | `/audit/logs`, `/audit/entities/{type}/{id}` | Audit |
| Configuration | `/config/parameters`, `/config/mcc`, `/config/feature-flags` | Configuration |
| TIPS Integration | `/internal/tips/*` | Integrations |
| CBS Integration | `/internal/cbs/*` | Integrations |
| Health | `/health`, `/health/ready`, `/metrics` | Health |

---

## Viewing the OpenAPI spec

```bash
# Swagger UI (Docker)
docker run -p 8080:8080 -e SWAGGER_JSON=/spec/mms-api-v1.openapi.yaml \
  -v "d:/Merchant Management System/Docs/openapi:/spec" swaggerapi/swagger-ui

# Redocly validate
npx @redocly/cli lint Docs/openapi/mms-api-v1.openapi.yaml
```

Import `Docs/openapi/mms-api-v1.openapi.yaml` into Postman, Insomnia, or Stoplight for interactive testing.

---

## Pagination response wrapper

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 245, "hasNext": true }
}
```

---

**End of REST API Specification**
