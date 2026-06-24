# MMS Master Module Flow
# Client Deliverable — End-to-End System Map

| Field | Value |
|-------|-------|
| **Document** | MMS Master Module Flow |
| **Version** | 1.2 — High-quality diagram export (client review) |
| **Date** | 12 June 2026 |
| **Classification** | Client Deliverable |
| **Project** | Merchant Management System (MMS) — TANQR / TIPS Tanzania |
| **Reference** | MMS-SPEC-TANQR-SCHOOL v1.3 |

---

## Executive summary

The **Merchant Management System (MMS)** enables merchants and schools to accept **QR-based payments** and **digital school fee collections** across multiple Financial Service Providers (FSPs).

**Client requirement (confirmed):** Each enrolled student receives a **permanent static Lipa Namba (8-digit pay bill number)** unique to that student for the **entire duration of their course**. Funds always credit the **school settlement account**; MMS routes payments to the correct student using a separate **internal routing ID** embedded in the TANQR payload (tag 62/05).

The platform is delivered in **five milestones**. All modules integrate with **TIPS** and **Core Banking System (CBS)** via the bank's **WSO2 API gateway**.

> **Viewing diagrams (recommended):** Open **`Docs/diagrams/MMS-Client-Diagrams-Viewer.html`** in Chrome or Edge for crisp zoomable diagrams. Use **SVG** files for PowerPoint/Word; use **PNG** for email attachments.

---

## Diagram legend

| Symbol | Meaning |
|--------|---------|
| **Solid arrow** | Primary business or data flow |
| **Dashed arrow** | External system integration (TIPS, CBS, FSP) |
| **Yellow band** | Project milestone (M1–M5) |
| **Cylinder** | Database / ledger store |
| **Maker-Checker** | Segregation of duties — two-person approval |

---

## Diagram 1 — Executive business flow (client view)

*High-level journey from onboarding through student enrolment, payment, settlement, and reporting.*

![Executive Business Flow](../diagrams/png/MMS-Executive-Business-Flow.png)

*Mermaid source: `Architecture/MMS-Executive-Business-Flow.mmd`*

**PNG (high resolution):** `Docs/diagrams/png/MMS-Executive-Business-Flow.png` (2800px @ 3× scale)

**SVG (vector — best for print/PPT):** `Docs/diagrams/svg/MMS-Executive-Business-Flow.svg`

**Viewer:** Open `Docs/diagrams/MMS-Client-Diagrams-Viewer.html` in Chrome/Edge

---

## Diagram 2 — Master module map (all milestones)

*Technical module view with student alias service, bulk upload, and payment routing.*

![Master Module Flow](../diagrams/png/MMS-Master-Module-Flow.png)

*Mermaid source: `Architecture/MMS-Master-Module-Flow.mmd`*

**PNG (high resolution):** `Docs/diagrams/png/MMS-Master-Module-Flow.png` (3600px @ 3× scale)

**SVG (vector):** `Docs/diagrams/svg/MMS-Master-Module-Flow.svg`

---

## Diagram 3 — Student alias dual-ID flow (school fees)

*Confirms client requirement: permanent pay bill per student, funds to school account.*

![Student Alias Dual-ID Flow](../diagrams/png/MMS-Student-Alias-Dual-ID-Flow.png)

*Mermaid source: `Architecture/MMS-Student-Alias-Dual-ID-Flow.mmd`*

**PNG (high resolution):** `Docs/diagrams/png/MMS-Student-Alias-Dual-ID-Flow.png` (2800px @ 3× scale)

**SVG (vector):** `Docs/diagrams/svg/MMS-Student-Alias-Dual-ID-Flow.svg`

---

## ID and QR issuance timing (client confirmation)

| Entity | Trigger | What is generated |
|--------|---------|-------------------|
| **School** | Onboarding approved (maker-checker) | TIPS merchant registration, school sequence (`SSS`), school adhoc alias (`780XXXXX`, student `0000`), static school TANQR |
| **Student (single)** | School creates student record | Permanent Lipa Namba, internal routing ID (`SSS+SSSS+C`), permanent static TANQR, async TIPS alias registration |
| **Student (bulk)** | CSV bulk upload | Same as single per row; returning students reactivate existing alias — never regenerate |
| **Invoice (optional)** | Fee statement issued | Dynamic TANQR adds amount + bill number; same student alias and internal ID |

---

## Dual-ID design summary

| ID | Format | TANQR tag | Registered in TIPS | Purpose |
|----|--------|-----------|-------------------|---------|
| **Public alias** | `780` + 4-digit global seq + Damm | 26/02 | Yes | Parent types on phone; scanner displays this |
| **Internal routing ID** | `SSS` + `SSSS` + Damm | 62/05 | No | MMS identifies school + student on webhook |

---

## End-to-end process (12 steps)

| Step | Phase | Description |
|------|-------|-------------|
| 1 | M1 | Bank or school user authenticates via Admin/Merchant Portal (JWT + RBAC) |
| 2 | M2 | Merchant or school application submitted with KYC documents |
| 3 | M2 | Maker-checker approves onboarding; merchant status set to **Active** |
| 4 | M2/M3 | CBS validates settlement account; TIPS registers **school** merchant |
| 5 | M2 | School adhoc alias + static TANQR issued; school sequence assigned |
| 6 | M2/M4 | Students enrolled (single or bulk); **permanent** Lipa Namba + internal ID + static TANQR per student |
| 7 | M3 | TIPS alias registration job confirms each student alias (async) |
| 8 | M3 | Parent pays using permanent student Lipa Namba; TIPS credits **school account** |
| 9 | M3 | Webhook received; MMS reads tag 62/05; payment allocated to student invoices |
| 10 | M4 | Settlement batch prepared; maker-checker approves; CBS credits merchant |
| 11 | M4 | Daily three-way reconciliation: MMS ledger / TIPS / CBS |
| 12 | M5 | Dashboards, reports, SMS to parent (permanent number + balance) |

---

## New database artifacts (per client review)

| Table | Purpose |
|-------|---------|
| `student_aliases` | Permanent Lipa Namba + internal routing ID per student |
| `school_sequences` | Per-school student counter (`last_student_seq` never resets) |

---

## Milestone deliverable mapping (contract alignment)

### Milestone 2 — additions per client review

| Deliverable | Module |
|-------------|--------|
| Student permanent Lipa Namba generation | 6 Alias Merchant ID + 7 School Fee Collection |
| Bulk student upload + alias generation | 7 School Fee Collection |
| Permanent static TANQR per student | 5 QR Management |
| `student_aliases` + `school_sequences` tables | Database Schema |

### Milestone 3 — additions per client review

| Deliverable | Module |
|-------------|--------|
| TIPS alias registration job (per student) | 18 TIPS Integration |
| Payment routing via tag 62/05 | 8 Transactions + 7 School Fee Collection |

---

## Cross-cutting controls

| Control | Module | Applies to |
|---------|--------|------------|
| Maker-checker | 14 | Merchant onboarding approval, settlement batch approval |
| Audit trail | 15 | All status changes, alias generation, payments, approvals |
| Notifications | 13 | Permanent Lipa Namba SMS, payment confirmations, KYC decisions |
| Permanent alias policy | 7 | One alias per student for entire course; never reused |

---

## Related deliverable documents

| Document | Path |
|----------|------|
| TANQR School Fee Spec | `Docs/MMS-SPEC-TANQR-SCHOOL-v1.3.md` (reference) |
| Enterprise System Architecture | `Architecture/Enterprise-System-Architecture.md` |
| Module Breakdown | `Architecture/Module-Breakdown.md` |
| Database Schema | `Database/docs/Database-Schema.md` |
| Flow diagram PNG (executive) | `Docs/diagrams/png/MMS-Executive-Business-Flow.png` |
| Flow diagram PNG (module map) | `Docs/diagrams/png/MMS-Master-Module-Flow.png` |
| Flow diagram PNG (student alias) | `Docs/diagrams/png/MMS-Student-Alias-Dual-ID-Flow.png` |
| Flow diagram SVG (all) | `Docs/diagrams/svg/` |
| HTML viewer (zoom + download) | `Docs/diagrams/MMS-Client-Diagrams-Viewer.html` |
| Re-render script | `Docs/scripts/render-client-diagrams.mjs` |

---

**Prepared for client sign-off — v1.2**

*Bank of Tanzania TANQR / TIPS aligned · Permanent student Lipa Namba per course*
