# Merchant Status Lifecycle API

Base path: `/api/v1/merchants/:merchantId/status`

All endpoints require `Authorization: Bearer <access_token>`.

## Status enum

| Value | Description |
|-------|-------------|
| `DRAFT` | New merchant; editable |
| `PENDING_REVIEW` | Submitted; not editable |
| `PENDING_APPROVAL` | Awaiting checker; not editable |
| `REJECTED` | Rejected; may resubmit |
| `ACTIVE` | Live merchant |
| `SUSPENDED` | Temporarily blocked |
| `DORMANT` | Inactive but recoverable |
| `CLOSED` | Terminal; no reactivation |

## Allowed transitions

| From | Action | To | Permission |
|------|--------|-----|------------|
| DRAFT | SUBMIT_FOR_REVIEW | PENDING_REVIEW | `merchant:status:submit` |
| PENDING_REVIEW | MOVE_TO_PENDING_APPROVAL | PENDING_APPROVAL | `merchant:status:approve` |
| PENDING_APPROVAL | APPROVE | ACTIVE | `merchant:status:checker:approve` |
| PENDING_REVIEW / PENDING_APPROVAL | REJECT | REJECTED | `merchant:status:reject` |
| REJECTED | SUBMIT_FOR_REVIEW | PENDING_REVIEW | `merchant:status:submit` |
| ACTIVE | SUSPEND | SUSPENDED | `merchant:suspend` |
| ACTIVE | MARK_DORMANT | DORMANT | `merchant:suspend` |
| SUSPENDED / DORMANT | REACTIVATE | ACTIVE | `merchant:suspend` |
| ACTIVE / SUSPENDED / DORMANT | CLOSE | CLOSED | `merchant:close` |

**Business rules**

- Maker cannot checker-approve their own merchant (`createdBy` ≠ approver).
- Invalid transitions return `400` with validation detail.
- Duplicate transitions within 5 seconds are rejected.
- Concurrent status changes return `400` (optimistic lock).
- Every change writes `MerchantStatusHistory` and `AuditLog`.

---

## GET `/allowed-actions`

Returns actions the current user may perform.

**Permission:** `merchant:read`

**Response `200`**

```json
{
  "merchantId": "uuid",
  "currentStatus": "DRAFT",
  "allowedActions": ["SUBMIT_FOR_REVIEW"]
}
```

---

## GET `/history`

Immutable status change audit trail.

**Permission:** `merchant:read`

**Response `200`**

```json
[
  {
    "id": "uuid",
    "fromStatus": "DRAFT",
    "toStatus": "PENDING_REVIEW",
    "action": "SUBMIT_FOR_REVIEW",
    "actorId": "uuid",
    "reason": null,
    "notes": "Ready for compliance review",
    "createdAt": "2026-06-04T10:00:00.000Z"
  }
]
```

---

## POST `/submit-review`

Draft → Pending Review.

**Permission:** `merchant:status:submit`

**Body**

```json
{ "notes": "optional string" }
```

**Response `200`:** Merchant object.

---

## POST `/pending-approval`

Pending Review → Pending Approval.

**Permission:** `merchant:status:approve`

**Body:** `{ "notes": "optional" }`

---

## POST `/approve`

Pending Approval → Active (checker only; not own merchant).

**Permission:** `merchant:status:checker:approve`

**Body:** `{ "notes": "optional" }`

---

## POST `/reject`

Pending Review or Pending Approval → Rejected.

**Permission:** `merchant:status:reject`

**Body**

```json
{
  "reason": "INCOMPLETE_KYC",
  "notes": "optional"
}
```

---

## POST `/suspend`

Active → Suspended.

**Permission:** `merchant:suspend`

---

## POST `/reactivate`

Suspended or Dormant → Active.

**Permission:** `merchant:suspend`

---

## POST `/dormant`

Active → Dormant.

**Permission:** `merchant:suspend`

---

## POST `/close`

→ Closed (terminal).

**Permission:** `merchant:close`

---

## Error responses

| Code | Meaning |
|------|---------|
| `401` | Missing or invalid token |
| `403` | Insufficient permission or maker-checker violation |
| `404` | Merchant not found |
| `400` | Invalid transition, duplicate, or status conflict |
