import { buildAliasMerchantId, validateAliasMerchantId } from '../domain/alias-merchant-id';
import { extractTag26SubTag, extractTag62SubTag } from '../domain/tlv.parser';
import {
  validateAcquirerId5,
  validateMerchantId,
  validateTanqrFieldInput,
  verifyTanqrPayload,
} from '../domain/tanqr-payload.validator';
import { buildTanqrPayload } from '../domain/tanqr-payload.builder';

describe('buildAliasMerchantId', () => {
  it('builds a valid 8-digit Damm alias from acquirer and merchant codes', () => {
    const alias = buildAliasMerchantId('001', '1234');
    expect(alias).toHaveLength(8);
    expect(validateAliasMerchantId(alias)).toBe(true);
    expect(alias.startsWith('0011234')).toBe(true);
  });
});

describe('validateTanqrFieldInput', () => {
  it('rejects invalid acquirer ID length', () => {
    expect(() =>
      validateAcquirerId5('123'),
    ).toThrow('Acquirer ID must be exactly 5 numeric digits');
  });

  it('rejects merchant ID longer than 15 digits', () => {
    expect(() =>
      validateMerchantId('1234567890123456'),
    ).toThrow('Merchant ID must not exceed 15 digits');
  });

  it('requires amount for dynamic QR', () => {
    expect(() =>
      validateTanqrFieldInput({
        poiMethod: '12',
        acquirerId5: '01001',
        merchantId: '12345678',
        mcc: '5814',
        merchantName: 'YN RESTAURANTS',
        city: 'DODOMA',
        postalCode: '41000',
      }),
    ).toThrow('Dynamic QR requires transaction amount');
  });

  it('does not require an amount for static QR', () => {
    expect(() =>
      validateTanqrFieldInput({
        poiMethod: '11',
        acquirerId5: '01001',
        merchantId: '12345678',
        mcc: '5814',
        merchantName: 'YN RESTAURANTS',
        city: 'DODOMA',
        postalCode: '41000',
      }),
    ).not.toThrow();
  });

  it('validates amount format for a static QR when one is supplied — e.g. a fixed school fee', () => {
    expect(() =>
      validateTanqrFieldInput({
        poiMethod: '11',
        acquirerId5: '01001',
        merchantId: '12345678',
        mcc: '5814',
        merchantName: 'YN RESTAURANTS',
        city: 'DODOMA',
        postalCode: '41000',
        amount: 'not-a-number',
      }),
    ).toThrow('Amount must be numeric');
  });

  it('accepts a well-formed fixed amount on a static QR', () => {
    expect(() =>
      validateTanqrFieldInput({
        poiMethod: '11',
        acquirerId5: '01001',
        merchantId: '12345678',
        mcc: '5814',
        merchantName: 'YN RESTAURANTS',
        city: 'DODOMA',
        postalCode: '41000',
        amount: '150000',
      }),
    ).not.toThrow();
  });
});

describe('verifyTanqrPayload', () => {
  it('verifies the official static merchant sample', () => {
    const payload =
      '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47';
    const result = verifyTanqrPayload(payload);
    expect(result.valid).toBe(true);
    expect(result.crcExpected).toBe('7D47');
    expect(result.poiMethod).toBe('11');
  });

  it('detects CRC mismatch', () => {
    const payload =
      '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA61054100062210308001123490705110026304FFFF';
    const result = verifyTanqrPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('CRC mismatch');
  });

  it('verifies a payload built with a full 15-digit bank Merchant ID, not just the 8-digit alias length', () => {
    // Tag 26's own length prefix depends on the Merchant ID length — this
    // previously assumed a fixed 8-digit ID (hardcoded "2639...") and
    // rejected every real payload this system issues, which uses up to a
    // 15-digit bank-assigned Merchant ID (tag 26/02), distinct from the
    // 8-digit Lipa Namba alias.
    const { tlvPayload } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: '044000000012345',
      mcc: '5814',
      merchantName: 'TEST MERCHANT',
      city: 'DODOMA',
      postalCode: '41000',
      additionalData: { storeLabel: '78012349' },
    });

    const result = verifyTanqrPayload(tlvPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('extractTag62SubTag', () => {
  it('extracts store label and terminal label from sample payload', () => {
    const payload =
      '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47';
    expect(extractTag62SubTag(payload, '03')).toBe('00112349');
    expect(extractTag62SubTag(payload, '07')).toBe('11002');
  });

  it('extracts a non-numeric terminal label (previously broken by a digit-only content regex)', () => {
    const { tlvPayload } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: '78000028',
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
      additionalData: {
        storeLabel: '78000028',
        terminalLabel: 'POS-07',
        referenceLabel: '00100014',
      },
    });
    expect(extractTag62SubTag(tlvPayload, '07')).toBe('POS-07');
    expect(extractTag62SubTag(tlvPayload, '03')).toBe('78000028');
    expect(extractTag62SubTag(tlvPayload, '05')).toBe('00100014');
  });
});

describe('extractTag26SubTag', () => {
  it('extracts the bank Merchant ID (tag 26/02), distinct from the 8-digit alias', () => {
    const merchantId15 = '044000000012345';
    const { tlvPayload } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: merchantId15,
      mcc: '5814',
      merchantName: 'TEST MERCHANT',
      city: 'DODOMA',
      postalCode: '41000',
      additionalData: { storeLabel: '78012349' },
    });

    expect(extractTag26SubTag(tlvPayload, '02')).toBe(merchantId15);
    expect(extractTag26SubTag(tlvPayload, '01')).toBe('01044');
  });
});

describe('dynamic TANQR sample', () => {
  it('builds dynamic payload with amount tag 54', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '12',
      acquirerId5: '01044',
      merchantId: '78100019',
      mcc: '5814',
      merchantName: 'YN RESTAURANTS',
      city: 'DODOMA',
      postalCode: '41000',
      amount: '2000.00',
      additionalData: {
        storeLabel: '00112349',
        terminalLabel: '11002',
      },
    });

    expect(tlvPayload).toContain('010212');
    expect(tlvPayload).toContain('010501044');
    expect(tlvPayload).toContain('020878100019');
    expect(tlvPayload).toContain('54072000.00');
    expect(verifyTanqrPayload(tlvPayload).valid).toBe(true);
    expect(crcValue).toHaveLength(4);
  });
});
