import { buildAliasMerchantId, validateAliasMerchantId } from '../domain/alias-merchant-id';
import { extractTag62SubTag } from '../domain/tlv.parser';
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
});

describe('extractTag62SubTag', () => {
  it('extracts store label and terminal label from sample payload', () => {
    const payload =
      '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47';
    expect(extractTag62SubTag(payload, '03')).toBe('00112349');
    expect(extractTag62SubTag(payload, '07')).toBe('11002');
  });
});

describe('dynamic TANQR sample', () => {
  it('builds dynamic payload with amount tag 54', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '12',
      acquirerId5: '01044',
      publicAlias: '78100019',
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
