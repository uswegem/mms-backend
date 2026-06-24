#!/usr/bin/env python3
"""Generate MMS OpenAPI 3.0 specification. Run: python generate_openapi.py"""
import yaml
from copy import deepcopy

PROBLEM = {"$ref": "#/components/schemas/ProblemDetails"}
ERR = {
    "401": {"$ref": "#/components/responses/Unauthorized"},
    "403": {"$ref": "#/components/responses/Forbidden"},
    "404": {"$ref": "#/components/responses/NotFound"},
    "400": {"$ref": "#/components/responses/ValidationError"},
    "409": {"$ref": "#/components/responses/Conflict"},
    "422": {"$ref": "#/components/responses/Unprocessable"},
}

def op(tag, summary, permission, method_responses, request=None, security=True, extra_params=None):
    o = {
        "tags": [tag],
        "summary": summary,
        "x-permission": permission,
        "parameters": [
            {"$ref": "#/components/parameters/CorrelationId"},
            *(extra_params or []),
        ],
        "responses": {**method_responses, **{k: ERR[k] for k in ERR if k not in method_responses}},
    }
    if request:
        o["requestBody"] = request
    if not security:
        o["security"] = []
    return o

def post(tag, summary, perm, ok_schema=None, ok_desc="Success", security=True, req=None, created=False, extra=None):
    code = "201" if created else "200"
    resp = {code: {"description": ok_desc}}
    if ok_schema:
        resp[code]["content"] = {"application/json": {"schema": ok_schema}}
    return {"post": op(tag, summary, perm, resp, req, security, extra)}

def get(tag, summary, perm, ok_schema=None, extra_params=None):
    resp = {"200": {"description": "OK"}}
    if ok_schema:
        resp["200"]["content"] = {"application/json": {"schema": ok_schema}}
    return {"get": op(tag, summary, perm, resp, extra_params=extra_params)}

def put(tag, summary, perm, req=None):
    return {"put": op(tag, summary, perm, {"200": {"description": "Updated"}}, req)}

def del_(tag, summary, perm):
    return {"delete": op(tag, summary, perm, {"204": {"description": "Deleted"}})}

UUID = {"type": "string", "format": "uuid"}
PAG = [{"$ref": "#/components/parameters/Page"}, {"$ref": "#/components/parameters/Limit"}]

spec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Merchant Management System API",
        "version": "1.0.0",
        "description": "TANQR/TIPS-aligned MMS REST API. Errors use RFC 7807 Problem Details.",
    },
    "servers": [
        {"url": "https://api.example.com/api/v1", "description": "Production"},
        {"url": "http://localhost:3000/api/v1", "description": "Local"},
    ],
    "tags": [
        {"name": "Authentication"}, {"name": "Authorization"}, {"name": "Users"},
        {"name": "Merchants"}, {"name": "Onboarding"}, {"name": "QR"}, {"name": "Alias"},
        {"name": "Transactions"}, {"name": "Settlement"}, {"name": "Reconciliation"},
        {"name": "SchoolFees"}, {"name": "Approvals"}, {"name": "Notifications"},
        {"name": "Reporting"}, {"name": "Dashboard"}, {"name": "Audit"},
        {"name": "Configuration"}, {"name": "Integrations"}, {"name": "Webhooks"}, {"name": "Health"},
    ],
    "security": [{"BearerAuth": []}],
    "paths": {},
    "components": {
        "securitySchemes": {
            "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
            "ClientCredentials": {"type": "http", "scheme": "basic"},
            "TipsWebhookHmac": {"type": "apiKey", "in": "header", "name": "X-TIPS-Signature"},
        },
        "parameters": {
            "CorrelationId": {"name": "X-Correlation-Id", "in": "header", "schema": {"type": "string", "format": "uuid"}},
            "IdempotencyKey": {"name": "Idempotency-Key", "in": "header", "required": True, "schema": {"type": "string", "maxLength": 64}},
            "Page": {"name": "page", "in": "query", "schema": {"type": "integer", "minimum": 1, "default": 1}},
            "Limit": {"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 20}},
        },
        "responses": {
            "Unauthorized": {"description": "Unauthorized", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-40101", "status": 401}}}},
            "Forbidden": {"description": "Forbidden", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-40301", "status": 403}}}},
            "NotFound": {"description": "Not found", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-40401", "status": 404}}}},
            "ValidationError": {"description": "Validation failed", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-40001", "status": 400}}}},
            "Conflict": {"description": "Conflict", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-40901", "status": 409}}}},
            "Unprocessable": {"description": "Business rule violation", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-42201", "status": 422}}}},
            "RateLimited": {"description": "Rate limited", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-42901", "status": 429}}}},
            "InternalError": {"description": "Internal error", "content": {"application/problem+json": {"schema": PROBLEM, "example": {"code": "MMS-50001", "status": 500}}}},
        },
        "schemas": {
            "ProblemDetails": {
                "type": "object",
                "required": ["title", "status", "code"],
                "properties": {
                    "type": {"type": "string"}, "title": {"type": "string"}, "status": {"type": "integer"},
                    "code": {"type": "string"}, "detail": {"type": "string"},
                    "correlationId": {"type": "string", "format": "uuid"},
                    "errors": {"type": "array", "items": {"type": "object", "properties": {"field": {"type": "string"}, "message": {"type": "string"}}}},
                },
            },
            "LoginRequest": {
                "type": "object", "required": ["email", "password"],
                "properties": {"email": {"type": "string", "format": "email"}, "password": {"type": "string", "minLength": 8}, "mfaCode": {"type": "string", "pattern": "^[0-9]{6}$"}},
            },
            "TokenResponse": {
                "type": "object",
                "properties": {"accessToken": {"type": "string"}, "expiresIn": {"type": "integer"}, "tokenType": {"type": "string", "example": "Bearer"}},
            },
            "Merchant": {
                "type": "object",
                "properties": {
                    "id": UUID, "legalName": {"type": "string"}, "tradingName": {"type": "string", "maxLength": 100},
                    "status": {"type": "string"}, "mcc": {"type": "string"}, "isSchool": {"type": "boolean"},
                },
            },
            "Payment": {
                "type": "object",
                "properties": {
                    "id": UUID, "tipsEndToEndId": {"type": "string"}, "amount": {"type": "number"},
                    "currency": {"type": "string"}, "status": {"type": "string"}, "channel": {"type": "string"},
                    "receivedAt": {"type": "string", "format": "date-time"},
                },
            },
            "QrCode": {
                "type": "object",
                "properties": {
                    "id": UUID, "qrType": {"type": "string", "enum": ["STATIC", "DYNAMIC"]},
                    "status": {"type": "string"}, "payload": {"type": "string"}, "downloadUrl": {"type": "string", "format": "uri"},
                },
            },
            "Invoice": {
                "type": "object",
                "properties": {
                    "id": UUID, "billNumber": {"type": "string"}, "totalAmount": {"type": "number"},
                    "paidAmount": {"type": "number"}, "status": {"type": "string"},
                },
            },
            "SettlementBatch": {
                "type": "object",
                "properties": {"id": UUID, "batchNo": {"type": "string"}, "status": {"type": "string"}, "netTotal": {"type": "number"}},
            },
            "ApprovalTask": {
                "type": "object",
                "properties": {"id": UUID, "entityType": {"type": "string"}, "entityId": UUID, "status": {"type": "string"}},
            },
            "TipsPaymentWebhook": {
                "type": "object", "required": ["endToEndId", "amount", "currency", "merchantId", "status"],
                "properties": {
                    "endToEndId": {"type": "string"}, "amount": {"type": "number", "minimum": 0.01},
                    "currency": {"type": "string", "enum": ["TZS"]}, "merchantId": {"type": "string"},
                    "status": {"type": "string", "enum": ["SUCCESS", "FAILED"]},
                    "billNumber": {"type": "string"}, "referenceLabel": {"type": "string"},
                    "payerMsisdn": {"type": "string"}, "completedAt": {"type": "string", "format": "date-time"},
                },
            },
        },
    },
}

p = spec["paths"]
json_req = lambda schema: {"required": True, "content": {"application/json": {"schema": schema}}}
id_path = lambda name="id": [{"name": name, "in": "path", "required": True, "schema": UUID}]

# --- Authentication ---
p["/auth/login"] = post("Authentication", "Login", "public", {"$ref": "#/components/schemas/TokenResponse"}, security=False,
    req=json_req({"$ref": "#/components/schemas/LoginRequest"}))
p["/auth/refresh"] = post("Authentication", "Refresh token", "public", {"$ref": "#/components/schemas/TokenResponse"}, security=False)
p["/auth/logout"] = post("Authentication", "Logout", "auth:login", ok_desc="No content")
p["/auth/logout-all"] = post("Authentication", "Logout all sessions", "auth:session:revoke-all", ok_desc="No content")
p["/auth/mfa/setup"] = post("Authentication", "Setup MFA", "auth:mfa:manage", ok_schema={"type": "object", "properties": {"secret": {"type": "string"}, "qrUrl": {"type": "string"}}})
p["/auth/mfa/verify"] = post("Authentication", "Verify MFA", "public", ok_schema={"type": "object", "properties": {"verified": {"type": "boolean"}}}, security=False,
    req=json_req({"type": "object", "required": ["email", "mfaCode"], "properties": {"email": {"type": "string"}, "mfaCode": {"type": "string"}}}))
p["/auth/password/forgot"] = post("Authentication", "Forgot password", "public", ok_desc="Email sent if account exists", security=False,
    req=json_req({"type": "object", "required": ["email"], "properties": {"email": {"type": "string", "format": "email"}}}))
p["/auth/password/reset"] = post("Authentication", "Reset password", "public", security=False,
    req=json_req({"type": "object", "required": ["token", "newPassword"], "properties": {"token": {"type": "string"}, "newPassword": {"type": "string", "minLength": 12}}}))
p["/auth/token/client"] = post("Authentication", "Client credentials", "auth:client:manage", {"$ref": "#/components/schemas/TokenResponse"},
    security=False, req=json_req({"type": "object", "required": ["clientId", "clientSecret"], "properties": {"clientId": {"type": "string"}, "clientSecret": {"type": "string"}}}))

# --- Authorization ---
p["/authz/roles"] = {**get("Authorization", "List roles", "authz:role:read", {"type": "array", "items": {"type": "object"}}),
    **post("Authorization", "Create role", "authz:role:write", created=True, req=json_req({"type": "object", "required": ["code", "name"], "properties": {"code": {"type": "string"}, "name": {"type": "string"}}}))}
p["/authz/roles/{id}"] = put("Authorization", "Update role", "authz:role:write", json_req({"type": "object", "properties": {"name": {"type": "string"}}}))
p["/authz/roles/{id}/permissions"] = put("Authorization", "Assign permissions", "authz:role:write",
    json_req({"type": "object", "required": ["permissionCodes"], "properties": {"permissionCodes": {"type": "array", "items": {"type": "string"}}}}))
p["/authz/permissions"] = get("Authorization", "List permissions", "authz:permission:read", {"type": "array", "items": {"type": "object"}})
p["/authz/me/permissions"] = get("Authorization", "My permissions", "authz:me", {"type": "array", "items": {"type": "string"}})
p["/authz/users/{userId}/effective-permissions"] = get("Authorization", "User effective permissions", "authz:role:read", {"type": "array", "items": {"type": "string"}})

# --- Users ---
p["/users"] = {**get("Users", "List users", "user:read", {"type": "object"}, PAG),
    **post("Users", "Create user", "user:write", created=True, req=json_req({"type": "object", "required": ["email", "fullName", "roleIds"], "properties": {"email": {"type": "string"}, "fullName": {"type": "string"}, "roleIds": {"type": "array", "items": UUID}}}))}
p["/users/me"] = get("Users", "Current user", "user:read", {"type": "object"})
p["/users/{id}"] = {**get("Users", "Get user", "user:read"), **put("Users", "Update user", "user:write", json_req({"type": "object", "properties": {"fullName": {"type": "string"}, "phone": {"type": "string"}}}))}
p["/users/{id}/deactivate"] = post("Users", "Deactivate user", "user:deactivate")
p["/users/invite"] = post("Users", "Invite user", "user:invite", created=True, req=json_req({"type": "object", "required": ["email", "roleId"], "properties": {"email": {"type": "string"}, "roleId": UUID}}))
p["/users/{id}/roles"] = put("Users", "Assign roles", "user:role:assign", json_req({"type": "object", "required": ["roleIds"], "properties": {"roleIds": {"type": "array", "items": UUID}}}))

# --- Merchants ---
p["/merchants"] = get("Merchants", "List merchants", "merchant:read", {"type": "object", "properties": {"data": {"type": "array", "items": {"$ref": "#/components/schemas/Merchant"}}, "meta": {"type": "object"}}}, PAG)
p["/merchants/{id}"] = {**get("Merchants", "Get merchant", "merchant:read", {"$ref": "#/components/schemas/Merchant"}),
    **put("Merchants", "Update merchant", "merchant:write", json_req({"type": "object", "properties": {"tradingName": {"type": "string", "maxLength": 100}, "city": {"type": "string", "maxLength": 15}, "postalCode": {"type": "string", "pattern": "^[0-9]{5}$"}, "mcc": {"type": "string", "pattern": "^[0-9]{4}$"}}}))}
p["/merchants/{id}/suspend"] = post("Merchants", "Suspend merchant", "merchant:suspend")
p["/merchants/{id}/reactivate"] = post("Merchants", "Reactivate merchant", "merchant:suspend")
p["/merchants/{id}/close"] = post("Merchants", "Close merchant", "merchant:close")
p["/merchants/{id}/stores"] = {**get("Merchants", "List stores", "merchant:read"), **post("Merchants", "Create store", "merchant:store:write", created=True, req=json_req({"type": "object", "required": ["storeLabel", "name"], "properties": {"storeLabel": {"type": "string", "maxLength": 25}, "name": {"type": "string"}}}))}
p["/stores/{id}"] = put("Merchants", "Update store", "merchant:store:write", json_req({"type": "object", "properties": {"name": {"type": "string"}, "address": {"type": "string"}}}))
p["/stores/{id}/terminals"] = {**get("Merchants", "List terminals", "merchant:read"), **post("Merchants", "Create terminal", "merchant:store:write", created=True, req=json_req({"type": "object", "required": ["terminalLabel"], "properties": {"terminalLabel": {"type": "string", "maxLength": 25}}}))}
p["/merchants/{id}/limits"] = put("Merchants", "Update limits", "merchant:limits:write", json_req({"type": "object", "properties": {"dailyLimitAmount": {"type": "number"}, "singleTxnMax": {"type": "number"}}}))
p["/merchants/{id}/documents"] = get("Merchants", "List documents", "merchant:read", {"type": "array", "items": {"type": "object"}})

# --- Onboarding ---
p["/onboarding/applications"] = {**get("Onboarding", "List applications", "onboarding:read", {"type": "object"}, PAG),
    **post("Onboarding", "Create application", "onboarding:write", created=True, req=json_req({"type": "object", "required": ["legalName", "tradingName"], "properties": {"legalName": {"type": "string"}, "tradingName": {"type": "string"}, "mcc": {"type": "string"}}}))}
p["/onboarding/applications/{id}"] = {**get("Onboarding", "Get application", "onboarding:read"), **put("Onboarding", "Update draft", "onboarding:write", json_req({"type": "object"}))}
p["/onboarding/applications/{id}/documents"] = post("Onboarding", "Upload KYC", "onboarding:write", created=True, req={"required": True, "content": {"multipart/form-data": {"schema": {"type": "object", "properties": {"file": {"type": "string", "format": "binary"}, "docType": {"type": "string"}}}}}})
p["/onboarding/applications/{id}/submit"] = post("Onboarding", "Submit for review", "onboarding:submit")
p["/onboarding/applications/{id}/aml-screen"] = post("Onboarding", "Trigger AML", "onboarding:aml:trigger")
p["/onboarding/applications/{id}/approve"] = post("Onboarding", "Approve (maker)", "onboarding:approve")
p["/onboarding/applications/{id}/reject"] = post("Onboarding", "Reject", "onboarding:reject", req=json_req({"type": "object", "required": ["rejectionCode"], "properties": {"rejectionCode": {"type": "string"}, "notes": {"type": "string"}}}))
p["/onboarding/applications/{id}/timeline"] = get("Onboarding", "Timeline", "onboarding:read", {"type": "array", "items": {"type": "object"}})

# --- QR ---
p["/qr/static"] = post("QR", "Generate static QR", "qr:generate", {"$ref": "#/components/schemas/QrCode"}, created=True,
    req=json_req({"type": "object", "required": ["merchantId"], "properties": {"merchantId": UUID, "storeId": UUID, "terminalId": UUID}}))
p["/qr/dynamic"] = post("QR", "Generate dynamic QR", "qr:generate", {"$ref": "#/components/schemas/QrCode"}, created=True,
    req=json_req({"type": "object", "required": ["merchantId", "amount"], "properties": {"merchantId": UUID, "amount": {"type": "number", "minimum": 0.01}, "billNumber": {"type": "string"}, "referenceLabel": {"type": "string"}, "invoiceId": UUID}}))
p["/qr/validate"] = post("QR", "Validate payload", "qr:validate", ok_schema={"type": "object", "properties": {"valid": {"type": "boolean"}, "crcValid": {"type": "boolean"}}},
    req=json_req({"type": "object", "required": ["payload"], "properties": {"payload": {"type": "string"}}}))
p["/qr/batch-print"] = post("QR", "Batch print PDF", "qr:generate", ok_schema={"type": "object", "properties": {"jobId": UUID}})
p["/qr/migrate"] = post("QR", "Migrate legacy QR", "qr:regenerate", req=json_req({"type": "object", "required": ["legacyPayload"], "properties": {"legacyPayload": {"type": "string"}, "merchantId": UUID}}))
p["/qr/{id}"] = get("QR", "Get QR", "qr:read", {"$ref": "#/components/schemas/QrCode"})
p["/qr/{id}/revoke"] = post("QR", "Revoke QR", "qr:revoke")
p["/qr/{id}/regenerate"] = post("QR", "Regenerate QR", "qr:regenerate", {"$ref": "#/components/schemas/QrCode"})
p["/qr/{id}/download"] = get("QR", "Download URL", "qr:read", {"type": "object", "properties": {"url": {"type": "string", "format": "uri"}, "expiresAt": {"type": "string", "format": "date-time"}}})
p["/merchants/{id}/qr"] = get("QR", "List merchant QRs", "qr:read", {"type": "array", "items": {"$ref": "#/components/schemas/QrCode"}})

# --- Alias ---
p["/merchants/{id}/alias"] = get("Alias", "Get Lipa Namba", "alias:read", {"type": "object", "properties": {"alias8digit": {"type": "string", "pattern": "^[0-9]{8}$"}}})
p["/merchants/{id}/alias/regenerate"] = post("Alias", "Regenerate alias", "alias:regenerate", ok_schema={"type": "object", "properties": {"alias8digit": {"type": "string"}}})
p["/alias/validate"] = post("Alias", "Validate Damm checksum", "alias:validate", ok_schema={"type": "object", "properties": {"valid": {"type": "boolean"}}},
    req=json_req({"type": "object", "required": ["alias8digit"], "properties": {"alias8digit": {"type": "string", "pattern": "^[0-9]{8}$"}}}))
p["/alias/lookup/{alias}"] = get("Alias", "Lookup merchant by alias", "alias:lookup", {"$ref": "#/components/schemas/Merchant"})

# --- Transactions ---
p["/webhooks/tips/payment"] = {
    "post": {
        "tags": ["Webhooks"], "summary": "TIPS payment notification", "x-permission": "transaction:webhook",
        "security": [{"TipsWebhookHmac": []}],
        "parameters": [{"$ref": "#/components/parameters/IdempotencyKey"}, {"$ref": "#/components/parameters/CorrelationId"}],
        "requestBody": json_req({"$ref": "#/components/schemas/TipsPaymentWebhook"}),
        "responses": {
            "200": {"description": "Accepted"},
            "401": {"description": "Invalid signature", "content": {"application/problem+json": {"example": {"code": "MMS-PAY-002"}}}},
            "409": {"description": "Duplicate e2e", "content": {"application/problem+json": {"example": {"code": "MMS-PAY-001"}}}},
        },
    }
}
p["/transactions"] = get("Transactions", "Search transactions", "transaction:read", {"type": "object", "properties": {"data": {"type": "array", "items": {"$ref": "#/components/schemas/Payment"}}}}, PAG)
p["/transactions/{id}"] = get("Transactions", "Get transaction", "transaction:read", {"$ref": "#/components/schemas/Payment"})
p["/transactions/{id}/events"] = get("Transactions", "Payment events", "transaction:read", {"type": "array", "items": {"type": "object"}})
p["/transactions/{id}/refund"] = post("Transactions", "Refund", "transaction:refund", created=True,
    req=json_req({"type": "object", "properties": {"amount": {"type": "number"}, "reason": {"type": "string"}}}), extra=[{"$ref": "#/components/parameters/IdempotencyKey"}])
p["/merchants/{id}/transactions"] = get("Transactions", "Merchant transactions", "transaction:self:read", {"type": "object"}, PAG)
p["/transactions/export"] = post("Transactions", "Export CSV", "transaction:export", ok_schema={"type": "object", "properties": {"jobId": UUID}})

# --- Settlement ---
p["/settlements/batches"] = get("Settlement", "List batches", "settlement:read", {"type": "array", "items": {"$ref": "#/components/schemas/SettlementBatch"}}, PAG)
p["/settlements/batches/generate"] = post("Settlement", "Generate batch", "settlement:generate", {"$ref": "#/components/schemas/SettlementBatch"}, created=True)
p["/settlements/batches/{id}"] = get("Settlement", "Batch detail", "settlement:read", {"$ref": "#/components/schemas/SettlementBatch"})
p["/settlements/batches/{id}/lines"] = get("Settlement", "Batch lines", "settlement:read", {"type": "array", "items": {"type": "object"}})
p["/settlements/batches/{id}/submit"] = post("Settlement", "Submit for approval", "settlement:submit")
p["/settlements/batches/{id}/approve"] = post("Settlement", "Approve batch", "settlement:approve")
p["/settlements/batches/{id}/reject"] = post("Settlement", "Reject batch", "settlement:approve", req=json_req({"type": "object", "properties": {"reason": {"type": "string"}}}))
p["/settlements/batches/{id}/post"] = post("Settlement", "Post to CBS", "settlement:post")
p["/merchants/{id}/settlements"] = get("Settlement", "Merchant settlements", "settlement:self:read", {"type": "array", "items": {"type": "object"}}, PAG)

# --- Reconciliation ---
p["/reconciliation/runs"] = {**get("Reconciliation", "List runs", "recon:read", {"type": "array", "items": {"type": "object"}}, PAG),
    **post("Reconciliation", "Start run", "recon:run", created=True, req=json_req({"type": "object", "properties": {"runDate": {"type": "string", "format": "date"}}}))}
p["/reconciliation/runs/{id}"] = get("Reconciliation", "Run detail", "recon:read", {"type": "object"})
p["/reconciliation/runs/{id}/exceptions"] = get("Reconciliation", "Exceptions", "recon:read", {"type": "array", "items": {"type": "object"}})
p["/reconciliation/runs/{id}/close"] = post("Reconciliation", "Close run", "recon:close")
p["/reconciliation/exceptions/{id}"] = put("Reconciliation", "Resolve exception", "recon:exception:resolve",
    json_req({"type": "object", "required": ["action"], "properties": {"action": {"type": "string"}, "notes": {"type": "string"}}}))
p["/reconciliation/exceptions/export"] = get("Reconciliation", "Export exceptions", "recon:read", ok_schema={"type": "object", "properties": {"downloadUrl": {"type": "string"}}})

# --- School ---
p["/schools/{merchantId}"] = {**get("SchoolFees", "School profile", "school:read"), **put("SchoolFees", "Update school", "school:write", json_req({"type": "object", "properties": {"registrationNo": {"type": "string"}, "headName": {"type": "string"}}}))}
for sub, perm_w in [("academic-years", "school:write"), ("terms", "school:write"), ("fee-items", "school:write"), ("students", "school:student:write")]:
    p[f"/schools/{{merchantId}}/{sub}"] = {**get("SchoolFees", f"List {sub}", "school:read"), **post("SchoolFees", f"Create {sub}", perm_w, created=True, req=json_req({"type": "object"}))}
p["/schools/{merchantId}/invoices"] = post("SchoolFees", "Create invoice", "school:invoice:write", {"$ref": "#/components/schemas/Invoice"}, created=True, req=json_req({"type": "object", "required": ["studentId", "termId"], "properties": {"studentId": UUID, "termId": UUID, "feeItemIds": {"type": "array", "items": UUID}}}))
p["/schools/{merchantId}/invoices/bulk"] = post("SchoolFees", "Bulk invoices", "school:invoice:write", ok_schema={"type": "object", "properties": {"created": {"type": "integer"}}})
p["/invoices/{id}"] = get("SchoolFees", "Get invoice", "school:read", {"$ref": "#/components/schemas/Invoice"})
p["/invoices/{id}/qr"] = post("SchoolFees", "Invoice QR", "school:invoice:qr", {"$ref": "#/components/schemas/QrCode"})
p["/invoices/{id}/allocate"] = post("SchoolFees", "Manual allocate", "school:write", req=json_req({"type": "object", "required": ["paymentId", "amount"], "properties": {"paymentId": UUID, "amount": {"type": "number"}}}))
p["/schools/{merchantId}/collections"] = get("SchoolFees", "Collections summary", "school:report:read", {"type": "object"})
p["/students/{id}/statement"] = get("SchoolFees", "Student statement", "school:statement:read", {"type": "object"})

# --- Approvals ---
p["/approvals/tasks"] = get("Approvals", "Checker inbox", "approval:task:read", {"type": "array", "items": {"$ref": "#/components/schemas/ApprovalTask"}}, PAG)
p["/approvals/tasks/{id}"] = get("Approvals", "Task detail", "approval:task:read", {"$ref": "#/components/schemas/ApprovalTask"})
p["/approvals/tasks/{id}/approve"] = post("Approvals", "Approve task", "approval:task:approve", req=json_req({"type": "object", "properties": {"notes": {"type": "string"}}}))
p["/approvals/tasks/{id}/reject"] = post("Approvals", "Reject task", "approval:task:reject", req=json_req({"type": "object", "required": ["notes"], "properties": {"notes": {"type": "string"}}}))
p["/approvals/policies"] = get("Approvals", "List policies", "approval:policy:write", {"type": "array", "items": {"type": "object"}})
p["/approvals/policies/{entityType}"] = put("Approvals", "Update policy", "approval:policy:write", json_req({"type": "object", "properties": {"enabled": {"type": "boolean"}, "slaHours": {"type": "integer"}}}))

# --- Notifications ---
p["/notifications/templates"] = get("Notifications", "List templates", "notification:template:write", {"type": "array", "items": {"type": "object"}})
p["/notifications/templates/{code}"] = put("Notifications", "Update template", "notification:template:write", json_req({"type": "object", "properties": {"bodyTemplate": {"type": "string"}, "subject": {"type": "string"}}}))
p["/notifications/log"] = get("Notifications", "Delivery log", "notification:log:read", {"type": "object"}, PAG)
p["/notifications/in-app"] = get("Notifications", "In-app inbox", "notification:self:read", {"type": "array", "items": {"type": "object"}}, PAG)
p["/notifications/in-app/{id}/read"] = put("Notifications", "Mark read", "notification:self:read")
p["/notifications/preferences"] = put("Notifications", "Update preferences", "notification:preferences:write", json_req({"type": "object", "properties": {"channel": {"type": "string"}, "enabled": {"type": "boolean"}}}))

# --- Reporting ---
p["/reports/definitions"] = get("Reporting", "Report catalog", "report:read", {"type": "array", "items": {"type": "object"}})
p["/reports/generate"] = post("Reporting", "Generate report", "report:read", ok_schema={"type": "object", "properties": {"jobId": UUID}}, req=json_req({"type": "object", "required": ["definitionCode"], "properties": {"definitionCode": {"type": "string"}, "params": {"type": "object"}}}))
p["/reports/jobs/{id}"] = get("Reporting", "Job status", "report:read", {"type": "object", "properties": {"status": {"type": "string"}, "downloadUrl": {"type": "string"}}})
p["/reports/jobs/{id}/download"] = get("Reporting", "Download report", "report:read", ok_schema={"type": "object", "properties": {"url": {"type": "string"}}})
p["/reports/regulatory/{type}"] = get("Reporting", "Regulatory report", "report:regulatory", ok_schema={"type": "object", "properties": {"jobId": UUID}})

# --- Dashboard ---
for dash, perm in [("acquirer", "dashboard:acquirer"), ("operations", "dashboard:ops"), ("finance", "dashboard:finance"),
                   ("merchant", "dashboard:merchant"), ("school", "dashboard:school")]:
    p[f"/dashboard/{dash}"] = get("Dashboard", f"{dash.title()} dashboard", perm, {"type": "object", "additionalProperties": True})
p["/dashboard/widgets"] = get("Dashboard", "Widget config", "dashboard:acquirer", {"type": "object"})

# --- Audit ---
p["/audit/logs"] = get("Audit", "Search audit logs", "audit:read", {"type": "object"}, PAG)
p["/audit/logs/{id}"] = get("Audit", "Audit detail", "audit:read", {"type": "object"})
p["/audit/logs/export"] = post("Audit", "Export audit", "audit:export", ok_schema={"type": "object", "properties": {"jobId": UUID}})
p["/audit/entities/{type}/{id}"] = get("Audit", "Entity history", "audit:read", {"type": "array", "items": {"type": "object"}})

# --- Config ---
p["/config/parameters"] = get("Configuration", "List parameters", "config:read", {"type": "array", "items": {"type": "object"}})
p["/config/parameters/{key}"] = put("Configuration", "Update parameter", "config:write", json_req({"type": "object", "required": ["configValue"], "properties": {"configValue": {"type": "string"}}}))
p["/config/mcc"] = get("Configuration", "MCC list", "config:read", {"type": "array", "items": {"type": "object"}})
p["/config/postcodes"] = get("Configuration", "Postcode lookup", "config:read", {"type": "array", "items": {"type": "object"}})
p["/config/acquirer"] = {**get("Configuration", "Acquirer config", "config:read"), **put("Configuration", "Update acquirer", "config:acquirer:write", json_req({"type": "object"}))}
p["/config/feature-flags"] = get("Configuration", "Feature flags", "config:read", {"type": "array", "items": {"type": "object"}})
p["/config/feature-flags/{key}"] = put("Configuration", "Toggle flag", "config:write", json_req({"type": "object", "required": ["enabled"], "properties": {"enabled": {"type": "boolean"}}}))
p["/config/calendar"] = get("Configuration", "Business calendar", "config:calendar:read", {"type": "array", "items": {"type": "object"}})

# --- Integrations ---
p["/internal/tips/register/{merchantId}"] = post("Integrations", "Register merchant on TIPS", "tips:register", ok_schema={"type": "object", "properties": {"status": {"type": "string"}}})
p["/internal/tips/reversal"] = post("Integrations", "TIPS reversal", "tips:reversal", req=json_req({"type": "object", "required": ["paymentId"], "properties": {"paymentId": UUID, "reason": {"type": "string"}}}))
p["/internal/tips/sync-directory"] = post("Integrations", "Sync TIPS directory", "tips:sync")
p["/internal/tips/message-log"] = get("Integrations", "TIPS message log", "tips:messagelog:read", {"type": "object"}, PAG)
p["/internal/tips/health"] = get("Integrations", "TIPS health", "tips:register", {"type": "object", "properties": {"status": {"type": "string"}}})
p["/internal/cbs/verify-account"] = post("Integrations", "Verify CBS account", "cbs:verify", req=json_req({"type": "object", "required": ["accountNumber", "bankCode"], "properties": {"merchantId": UUID, "accountNumber": {"type": "string"}, "bankCode": {"type": "string"}}}))
p["/internal/cbs/post-settlement"] = post("Integrations", "CBS post settlement", "cbs:post", req=json_req({"type": "object", "required": ["settlementLineId"], "properties": {"settlementLineId": UUID}}))
p["/internal/cbs/statement/{date}"] = get("Integrations", "CBS EOD statement", "cbs:statement:read", {"type": "object"})
p["/internal/cbs/health"] = get("Integrations", "CBS health", "cbs:verify", {"type": "object"})
p["/internal/cbs/message-log"] = get("Integrations", "CBS message log", "cbs:messagelog:read", {"type": "object"}, PAG)

# --- Health ---
p["/health"] = {"get": {"tags": ["Health"], "summary": "Liveness", "security": [], "x-permission": "public", "responses": {"200": {"description": "OK", "content": {"application/json": {"schema": {"type": "object", "properties": {"status": {"type": "string", "example": "ok"}}}}}}}}}
p["/health/ready"] = {"get": {"tags": ["Health"], "summary": "Readiness", "security": [], "x-permission": "public", "responses": {"200": {"description": "Ready"}, "503": {"description": "Not ready"}}}}
p["/metrics"] = {"get": {"tags": ["Health"], "summary": "Prometheus metrics", "security": [], "x-permission": "public", "responses": {"200": {"description": "text/plain metrics"}}}}
p["/monitoring/status"] = get("Health", "Monitoring status", "monitoring:read", {"type": "object"})
p["/monitoring/sla"] = get("Health", "SLA metrics", "monitoring:sla:read", {"type": "object"})

out = "mms-api-v1.openapi.yaml"
class NoAliasDumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

with open(out, "w", encoding="utf-8") as f:
    yaml.dump(spec, f, Dumper=NoAliasDumper, sort_keys=False, allow_unicode=True, default_flow_style=False, width=120)
print(f"Generated {out} with {len(p)} paths")
