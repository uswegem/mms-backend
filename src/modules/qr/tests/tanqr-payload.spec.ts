import { buildTanqrPayload } from '../domain/tanqr-payload.builder';
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
      publicAlias: '12345678',
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
      publicAlias: '78000028',
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
      publicAlias: '78000028',
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
});
