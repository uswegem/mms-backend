import { BulkStudentUploadService } from '../application/services/bulk-student-upload.service';

describe('BulkStudentUploadService — guardian phone required (brief §4.3.4)', () => {
  const service = new BulkStudentUploadService();

  it('rejects a row with no guardian phone at all, with a clear correctable error', () => {
    const csv = 'admission_no,full_name\nADM-001,Amina Hassan\n';
    const [row] = service.parseCsv(csv);

    expect(row.valid).toBe(false);
    expect(row.errors).toContain('Guardian phone number is required');
  });

  it('accepts and normalizes a 07XXXXXXXX guardian phone to 2557XXXXXXXX', () => {
    const csv =
      'admission_no,full_name,guardian_phone\nADM-001,Amina Hassan,0712345678\n';
    const [row] = service.parseCsv(csv);

    expect(row.valid).toBe(true);
    expect(row.guardianPhone).toBe('255712345678');
  });

  it('accepts an already-2557XXXXXXXX guardian phone unchanged', () => {
    const csv =
      'admission_no,full_name,guardian_phone\nADM-001,Amina Hassan,255712345678\n';
    const [row] = service.parseCsv(csv);

    expect(row.valid).toBe(true);
    expect(row.guardianPhone).toBe('255712345678');
  });

  it('rejects a malformed guardian phone with a correctable error rather than silently dropping it', () => {
    const csv =
      'admission_no,full_name,guardian_phone\nADM-001,Amina Hassan,12345\n';
    const [row] = service.parseCsv(csv);

    expect(row.valid).toBe(false);
    expect(row.errors.some((e) => e.includes('Invalid Tanzanian mobile'))).toBe(
      true,
    );
  });

  it('does not let a missing-phone row slip through file-duplicate flagging as valid', () => {
    const csv =
      'admission_no,full_name\nADM-001,Amina Hassan\nADM-002,Juma Said\n';
    const rows = service.flagFileDuplicates(service.parseCsv(csv));

    expect(rows.every((r) => !r.valid)).toBe(true);
  });
});
