import {
  buildTanqrPayload,
  verifyTanqrCrc,
} from '../domain/tanqr-payload.builder';
import { buildTLV } from '../domain/tlv.builder';
import { crc16 } from '../domain/crc16';

describe('crc16', () => {
  it('matches EMVCo golden CRC for static merchant sample', () => {
    const payload =
      '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA6105410006221030800112349070511002';
    expect(crc16(payload + '6304')).toBe('7D47');
  });

  it('matches school static golden CRC', () => {
    const payload =
      '00020101021126390014tz.go.bot.tips0105010440208780000285204821153038345802TZ5919MAPAMBANO SECONDARY6013DAR ES SALAAM6105110006212050800100014';
    expect(crc16(payload + '6304')).toBe('35EA');
  });

  it('matches school dynamic invoice golden CRC', () => {
    const payload =
      '00020101021226390014tz.go.bot.tips01050104402087800002852048211530383454061500005802TZ5919MAPAMBANO SECONDARY6013DAR ES SALAAM61051100062350119TERM1-2024-00100014050800100014';
    expect(crc16(payload + '6304')).toBe('A362');
  });
});

describe('buildTLV', () => {
  it('builds canonical segments', () => {
    expect(buildTLV('00', '01')).toBe('000201');
    expect(buildTLV('53', '834')).toBe('5303834');
  });
});

describe('buildTanqrPayload', () => {
  it('builds static merchant sample payload', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01001',
      merchantId: '12345678',
      mcc: '5814',
      merchantName: 'YN RESTAURANTS',
      city: 'DODOMA',
      postalCode: '41000',
      additionalData: {
        storeLabel: '00112349',
        terminalLabel: '11002',
      },
    });
    expect(tlvPayload).toBe(
      '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47',
    );
    expect(crcValue).toBe('7D47');
  });

  it('builds school static payload', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: '78000028',
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
      additionalData: {
        referenceLabel: '00100014',
      },
    });
    expect(tlvPayload).toBe(
      '00020101021126390014tz.go.bot.tips0105010440208780000285204821153038345802TZ5919MAPAMBANO SECONDARY6013DAR ES SALAAM6105110006212050800100014630435EA',
    );
    expect(crcValue).toBe('35EA');
  });

  it('builds school dynamic invoice payload', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '12',
      acquirerId5: '01044',
      merchantId: '78000028',
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
      amount: '150000',
      additionalData: {
        billNumber: 'TERM1-2024-00100014',
        referenceLabel: '00100014',
      },
    });
    expect(tlvPayload).toBe(
      '00020101021226390014tz.go.bot.tips01050104402087800002852048211530383454061500005802TZ5919MAPAMBANO SECONDARY6013DAR ES SALAAM61051100062350119TERM1-2024-001000140508001000146304A362',
    );
    expect(crcValue).toBe('A362');
  });

  it('omits tag 54 entirely for a plain static QR without an amount', () => {
    const fields = {
      poiMethod: '11' as const,
      acquirerId5: '01044',
      merchantId: '78000028',
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
    };
    const withoutAmount = buildTanqrPayload(fields);
    const withAmount = buildTanqrPayload({ ...fields, amount: '150000' });

    expect(withAmount.tlvPayload).toContain(buildTLV('54', '150000'));
    expect(withoutAmount.tlvPayload).not.toContain(buildTLV('54', '150000'));
    expect(verifyTanqrCrc(withoutAmount.tlvPayload, withoutAmount.crcValue)).toBe(true);
    expect(verifyTanqrCrc(withAmount.tlvPayload, withAmount.crcValue)).toBe(true);
  });

  it('builds a static QR with a fixed amount (tag 54) — e.g. a school termly fee — and stays POI method 11', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: '78000028',
      mcc: '8211',
      merchantName: 'MAPAMBANO SECONDARY',
      city: 'DAR ES SALAAM',
      postalCode: '11000',
      amount: '150000',
      additionalData: {
        referenceLabel: '00100014',
      },
    });

    expect(tlvPayload).toContain(buildTLV('01', '11'));
    expect(tlvPayload).toContain(buildTLV('54', '150000'));
    expect(verifyTanqrCrc(tlvPayload, crcValue)).toBe(true);
  });

  it('still requires an amount for dynamic (POI method 12) — unchanged by static-amount support', () => {
    expect(() =>
      buildTanqrPayload({
        poiMethod: '12',
        acquirerId5: '01044',
        merchantId: '78000028',
        mcc: '8211',
        merchantName: 'MAPAMBANO SECONDARY',
        city: 'DAR ES SALAAM',
        postalCode: '11000',
      }),
    ).toThrow('Dynamic TANQR requires transaction amount (tag 54)');
  });

  it('keeps the 15-digit Merchant ID (tag 26/02) and 8-digit alias (tag 62/03) as distinct values', () => {
    const merchantId15 = '044000000012345';
    const alias8digit = '78012349';
    const { tlvPayload } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: merchantId15,
      mcc: '5814',
      merchantName: 'TEST MERCHANT',
      city: 'DODOMA',
      postalCode: '41000',
      additionalData: { storeLabel: alias8digit },
    });

    expect(merchantId15).not.toBe(alias8digit);
    // Tag 26/02 carries the 15-digit Merchant ID inside the merchant account template.
    expect(tlvPayload).toContain(buildTLV('02', merchantId15));
    // Tag 62/03 carries the 8-digit alias inside the additional data template — a
    // different value, not a truncation/derivation of the Merchant ID.
    expect(tlvPayload).toContain(buildTLV('03', alias8digit));
    expect(tlvPayload).not.toContain(buildTLV('02', alias8digit));
  });
});

describe('verifyTanqrCrc', () => {
  it('passes for a payload whose embedded CRC matches its own bytes', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: '044000000012345',
      mcc: '5814',
      merchantName: 'TEST MERCHANT',
      city: 'DODOMA',
      postalCode: '41000',
    });
    expect(verifyTanqrCrc(tlvPayload, crcValue)).toBe(true);
  });

  it('fails when a single character of the payload is corrupted', () => {
    const { tlvPayload, crcValue } = buildTanqrPayload({
      poiMethod: '11',
      acquirerId5: '01044',
      merchantId: '044000000012345',
      mcc: '5814',
      merchantName: 'TEST MERCHANT',
      city: 'DODOMA',
      postalCode: '41000',
    });
    const corrupted =
      tlvPayload.slice(0, 20) +
      (tlvPayload[20] === '0' ? '1' : '0') +
      tlvPayload.slice(21);
    expect(verifyTanqrCrc(corrupted, crcValue)).toBe(false);
  });
});
