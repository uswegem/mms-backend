# QR Generation (TANQR)

Local static and dynamic TANQR QR generation for MMS merchants and schools. No external QR, payment, or TIPS APIs are called during generation.

## Flow

1. **Eligibility** — `QrValidators.validateMerchantForQr()` checks merchant status, profile, alias, MCC, and local TIPS/acquirer data.
2. **TLV payload** — `buildTanqrPayload()` assembles EMVCo tags in TANQR order (00, 01, 26, 52, 53, [54], 58–62, 63).
3. **CRC16** — ISO/IEC 13239 style CRC over payload + `6304` suffix.
4. **Persistence** — `qr_codes`, `qr_payload_versions`, `qr_render_assets` (versioned; static reuse unless `force_regenerate`).
5. **Render** — PNG/SVG via local `qrcode` package; files under `storage/qr/{merchant_id}/{qr_id}/v{version}.*`.

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/merchants/{merchantId}/qr/static` | Reusable static QR (POI `11`) |
| `POST` | `/api/v1/merchants/{merchantId}/qr/dynamic` | Per-payment dynamic QR (POI `12`, tag `54`) |
| `GET` | `/api/v1/merchants/{merchantId}/qr` | List active QRs |

### Static example

```http
POST /api/v1/merchants/{merchantId}/qr/static
Authorization: Bearer <token>
Content-Type: application/json

{
  "store_id": null,
  "terminal_id": null,
  "purpose": "checkout",
  "force_regenerate": false
}
```

```json
{
  "success": true,
  "qr_id": "…",
  "qr_type": "static",
  "poi_method": "11",
  "status": "active",
  "version": 1,
  "merchant_id": "…",
  "alias": "78000028",
  "tlv_payload": "000201…",
  "crc": "35EA",
  "assets": {
    "png": "/storage/qr/…/v1.png",
    "svg": "/storage/qr/…/v1.svg"
  }
}
```

### Dynamic example

```http
POST /api/v1/merchants/{merchantId}/qr/dynamic
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": "150000",
  "bill_number": "TERM1-2024-00100014",
  "reference_label": "00100014",
  "expires_in_minutes": 30
}
```

School/student QRs place the public Lipa Namba in tag `26/02` and the internal routing ID in tag `62/05` only (not in payer-facing alias).

## Tests

```bash
npm test -- --testPathPatterns=modules/qr
```

Golden vectors for TLV + CRC are in `tests/tanqr-payload.spec.ts`.
