import { BadRequestException, Injectable } from '@nestjs/common';
import type { BulkStudentRow } from './student-alias.service';

@Injectable()
export class BulkStudentUploadService {
  async parseInput(
    file?: { buffer: Buffer },
    csvText?: string,
  ): Promise<BulkStudentRow[]> {
    const text = file?.buffer?.toString('utf8') ?? csvText;
    if (!text?.trim()) {
      throw new BadRequestException('CSV file or csv body is required');
    }
    return this.parseCsv(text);
  }

  parseCsv(text: string): BulkStudentRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new BadRequestException('CSV must include header and at least one row');
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const admissionIdx = header.findIndex((h) =>
      ['admission_no', 'admissionno', 'admission'].includes(h),
    );
    const nameIdx = header.findIndex((h) =>
      ['full_name', 'fullname', 'name', 'student_name'].includes(h),
    );
    const phoneIdx = header.findIndex((h) =>
      ['guardian_phone', 'phone', 'parent_phone'].includes(h),
    );

    if (admissionIdx < 0 || nameIdx < 0) {
      throw new BadRequestException(
        'CSV header must include admission_no and full_name columns',
      );
    }

    return lines.slice(1).map((line, i) => {
      const cols = line.split(',').map((c) => c.trim());
      const admissionNo = cols[admissionIdx];
      const fullName = cols[nameIdx];
      if (!admissionNo || !fullName) {
        throw new BadRequestException(`Row ${i + 2}: admission_no and full_name required`);
      }
      return {
        row: i + 2,
        admissionNo,
        fullName,
        guardianPhone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
      };
    });
  }
}
