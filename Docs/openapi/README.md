# MMS OpenAPI

| File | Description |
|------|-------------|
| `mms-api-v1.openapi.yaml` | OpenAPI 3.0.3 — **137 path entries** |
| `generate_openapi.py` | Generator script (rebuild after route changes) |

```bash
python generate_openapi.py
```

Each operation includes:
- `x-permission` — RBAC permission code
- Request/response JSON schemas
- Standard error responses (401, 403, 404, 400, 409, 422)
- Validations via JSON Schema (required, minLength, pattern, enum)

Human-readable index: `Docs/REST-API-Specification.md`
