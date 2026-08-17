import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { normalizeMobile } from '../../domain/guardian-phone.util';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CsvImportRow {
  row: number;
  admissionNo: string;
  fullName: string;
  /// Mandatory (brief §4.3.4) — invalid rows carry '' here and are always
  /// `valid: false`, so this is never actually persisted empty; typed as a
  /// guaranteed string (not optional) so the compiler enforces that every
  /// downstream consumer only ever sees committed, valid rows.
  guardianPhone: string;
  parentEmail?: string;
}

export interface PreviewRow extends CsvImportRow {
  errors: string[];
  valid: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class BulkStudentUploadService {
  // ── Parse CSV file buffer using csv-parse ─────────────────────────────────

  parseInput(file?: { buffer: Buffer }, csvText?: string): PreviewRow[] {
    const text = file?.buffer?.toString('utf8') ?? csvText;
    if (!text?.trim()) {
      throw new BadRequestException('CSV file or csv body is required');
    }
    return this.parseCsv(text);
  }

  parseCsv(text: string): PreviewRow[] {
    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
    } catch (err) {
      throw new BadRequestException(
        `CSV parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (records.length === 0) {
      throw new BadRequestException('CSV must contain at least one data row');
    }

    // Normalise header keys to lower_snake_case
    const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_');

    return records.map((raw, i) => {
      const rec: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) rec[normalizeKey(k)] = v;

      const rowNum = i + 2; // 1-indexed with header as row 1
      const errors: string[] = [];

      // Admission number
      const admissionNo =
        rec['admission'] ?? rec['admission_no'] ?? rec['admissionno'] ?? '';
      if (!admissionNo) errors.push('Admission number is required');

      // First + Surname → fullName
      const firstName = rec['firstname'] ?? rec['first_name'] ?? '';
      const surname =
        rec['surname'] ?? rec['lastname'] ?? rec['last_name'] ?? '';
      const explicitFullName =
        rec['full_name'] ?? rec['fullname'] ?? rec['name'] ?? '';
      const fullName = explicitFullName || `${firstName} ${surname}`.trim();
      if (!fullName)
        errors.push('Name is required (FirstName + Surname, or full_name)');

      // Parent email (optional but validated if present)
      const rawEmail =
        rec['parentemail'] ?? rec['parent_email'] ?? rec['email'] ?? '';
      let parentEmail: string | undefined;
      if (rawEmail) {
        if (!EMAIL_RE.test(rawEmail)) {
          errors.push(`Invalid email: ${rawEmail}`);
        } else {
          parentEmail = rawEmail.toLowerCase();
        }
      }

      // Mobile / guardian phone — mandatory (brief §4.3.4): this is the
      // primary delivery address for the student's Lipa Namba notification,
      // so a row missing it is rejected here rather than committing a
      // student with no notification address and deferring the problem to
      // send time.
      const rawMobile =
        rec['mobilenumber'] ??
        rec['mobile_number'] ??
        rec['mobile'] ??
        rec['guardian_phone'] ??
        rec['phone'] ??
        '';
      let guardianPhone = '';
      if (!rawMobile) {
        errors.push('Guardian phone number is required');
      } else {
        const normalized = normalizeMobile(rawMobile);
        if (!normalized) {
          errors.push(
            `Invalid Tanzanian mobile: ${rawMobile} — use 07XXXXXXXX or 2557XXXXXXXX`,
          );
        } else {
          guardianPhone = normalized;
        }
      }

      return {
        row: rowNum,
        admissionNo: admissionNo.slice(0, 30),
        fullName: fullName.slice(0, 255),
        guardianPhone,
        parentEmail,
        errors,
        valid: errors.length === 0,
      };
    });
  }

  // ── Validate for duplicates within the file ───────────────────────────────

  flagFileDuplicates(rows: PreviewRow[]): PreviewRow[] {
    const seen = new Map<string, number>();
    return rows.map((r) => {
      const key = r.admissionNo.toLowerCase();
      if (seen.has(key)) {
        return {
          ...r,
          errors: [
            ...r.errors,
            `Duplicate admission number in file (first seen on row ${seen.get(key)})`,
          ],
          valid: false,
        };
      }
      seen.set(key, r.row);
      return r;
    });
  }
}
