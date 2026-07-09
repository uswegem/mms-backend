# TANQR Merchant-Presented QR Generator

In-house TANQR QR generation for Tanzania instant payments. **No third-party QR APIs, SaaS providers, or external payment QR services** are used. The system generates:

1. The EMVCo/TANQR TLV payload string locally
2. The QR matrix image (PNG/SVG) locally via the `qrcode` npm package
3. The Annex 2 merchant display layout (SVG/PDF) locally via `pdfkit`

## Architecture

```
API Layer (NestJS)
  POST /merchants/:id/qr/static   POST /merchants/:id/qr/dynamic
  POST /qr/validate               GET  /qr/:id/image.png
  GET  /qr/:id/display.pdf        GET  /qr/:id
        |
QrService (orchestration)
  eligibility -> payload -> persist -> render -> audit
        |
  QrValidators | TanqrPayloadBuilder | QrRendererService | QrAnnex2DisplayService
```

### Static vs Dynamic

| Type | Tag 01 | Tag 54 (amount) | Use case |
|------|--------|-----------------|----------|
| Static | `11` | Omitted | Reusable POS QR; customer enters amount |
| Dynamic | `12` | Required | Per-transaction QR with fixed amount |

## API endpoints

Base: `/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/merchants/{merchantId}/qr/static` | Generate static QR (POI `11`) |
| `POST` | `/merchants/{merchantId}/qr/dynamic` | Generate dynamic QR (POI `12`) |
| `GET` | `/merchants/{merchantId}/qr` | List merchant QRs |
| `POST` | `/qr/static` | Legacy static (body includes `merchantId`) |
| `POST` | `/qr/dynamic` | Legacy dynamic (body includes `merchantId`) |
| `POST` | `/qr/validate` | Verify CRC or build-and-verify payload |
| `GET` | `/qr/{id}` | Get QR with latest payload |
| `GET` | `/qr/{id}/image.png` | Download QR matrix PNG |
| `GET` | `/qr/{id}/image.svg` | Download QR matrix SVG |
| `GET` | `/qr/{id}/display.pdf` | Download Annex 2 display PDF |
| `PATCH` | `/qr/{id}/disable` | Revoke QR |

## Official golden sample

Expected payload for static merchant sample:
```
00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47
```

## How to verify TANQR compliance

1. Run unit tests: `npm test -- --testPathPatterns=modules/qr`
2. Call `POST /qr/validate` with `tlv_payload` to verify CRC
3. Scan generated PNG with a QR reader; decoded text must match TLV payload exactly
4. Test with TIPS-compatible banking app for merchant name, alias, and amount display

## Tests

```bash
npm test -- --testPathPatterns=modules/qr
```
