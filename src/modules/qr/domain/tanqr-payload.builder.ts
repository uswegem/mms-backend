import { buildNestedTLV, buildTLV } from './tlv.builder';
import { crc16 } from './crc16';
import {
  validateAcquirerId5,
  validateMerchantId,
  validateTag62Content,
} from './tanqr-payload.validator';

export const TANQR_DOMAIN = 'tz.go.bot.tips';
export const TANQR_CURRENCY = '834';
export const TANQR_COUNTRY = 'TZ';

export interface TanqrAdditionalData {
  billNumber?: string;
  storeLabel?: string;
  terminalLabel?: string;
  referenceLabel?: string;
}

export interface TanqrPayloadInput {
  poiMethod: '11' | '12';
  acquirerId5: string;
  /** TANQR tag 26/02 — bank-assigned Merchant ID (up to 15 digits), NOT the
   * 8-digit Lipa Namba alias. Pass the alias via additionalData.storeLabel
   * (tag 62/03) instead. */
  merchantId: string;
  mcc: string;
  merchantName: string;
  city: string;
  postalCode: string;
  domain?: string;
  currency?: string;
  country?: string;
  amount?: string;
  additionalData?: TanqrAdditionalData;
}

/** @deprecated Use TanqrPayloadInput — kept for issuance pipeline compatibility. */
export interface StaticTanqrInput {
  merchantName: string;
  city: string;
  postalCode: string;
  mcc: string;
  /** TANQR tag 26/02 — bank-assigned Merchant ID (up to 15 digits), NOT the
   * 8-digit Lipa Namba alias. Pass the alias via storeLabel (tag 62/03) instead. */
  merchantId: string;
  acquirerId5: string;
  internalRoutingId?: string;
  poiMethod?: '11' | '12';
  amount?: string;
  billNumber?: string;
  storeLabel?: string;
  terminalLabel?: string;
  referenceLabel?: string;
}

function buildTipsMerchantAccountTemplate(
  domain: string,
  acquirerId5: string,
  merchantId: string,
): string {
  const normalizedAcquirer = validateAcquirerId5(acquirerId5);
  const normalizedMerchantId = validateMerchantId(merchantId);
  const children =
    buildTLV('00', domain) +
    buildTLV('01', normalizedAcquirer) +
    buildTLV('02', normalizedMerchantId);
  return buildNestedTLV('26', children);
}

function buildAdditionalDataField(data?: TanqrAdditionalData): string | null {
  if (!data) return null;
  const parts: string[] = [];
  if (data.billNumber) parts.push(buildTLV('01', data.billNumber));
  if (data.storeLabel) parts.push(buildTLV('03', data.storeLabel));
  if (data.referenceLabel) parts.push(buildTLV('05', data.referenceLabel));
  if (data.terminalLabel) parts.push(buildTLV('07', data.terminalLabel));
  if (parts.length === 0) return null;
  const nested = parts.join('');
  validateTag62Content(nested);
  return buildNestedTLV('62', nested);
}

export function buildTanqrPayload(input: TanqrPayloadInput): {
  tlvPayload: string;
  crcValue: string;
} {
  const domain = input.domain ?? TANQR_DOMAIN;
  const currency = input.currency ?? TANQR_CURRENCY;
  const country = input.country ?? TANQR_COUNTRY;

  const parts: string[] = [
    buildTLV('00', '01'),
    buildTLV('01', input.poiMethod),
    buildTipsMerchantAccountTemplate(domain, input.acquirerId5, input.merchantId),
    buildTLV('52', input.mcc.padStart(4, '0').slice(0, 4)),
    buildTLV('53', currency),
  ];

  if (input.poiMethod === '12' && !input.amount) {
    throw new Error('Dynamic TANQR requires transaction amount (tag 54)');
  }
  // Tag 54 is optional on a static QR (POI method 11) — a fixed-fee QR (e.g.
  // a school's termly fee, printed once) bakes the amount in without making
  // the QR dynamic/expiring.
  if (input.amount) {
    parts.push(buildTLV('54', input.amount));
  }

  parts.push(
    buildTLV('58', country),
    buildTLV('59', input.merchantName),
    buildTLV('60', input.city),
    buildTLV('61', input.postalCode),
  );

  const tag62 = buildAdditionalDataField(input.additionalData);
  if (tag62) parts.push(tag62);

  const withoutCrc = parts.join('');
  const crcInput = withoutCrc + '6304';
  const crcValue = crc16(crcInput);
  const tlvPayload = withoutCrc + buildTLV('63', crcValue);

  return { tlvPayload, crcValue };
}

/** Backward-compatible wrapper used by issuance services. */
export function buildStaticTanqrPayload(input: StaticTanqrInput): {
  tlvPayload: string;
  crcValue: string;
} {
  const additionalData: TanqrAdditionalData = {};
  if (input.billNumber) additionalData.billNumber = input.billNumber;
  if (input.storeLabel) additionalData.storeLabel = input.storeLabel;
  if (input.terminalLabel) additionalData.terminalLabel = input.terminalLabel;
  if (input.referenceLabel) additionalData.referenceLabel = input.referenceLabel;
  else if (input.internalRoutingId) {
    additionalData.referenceLabel = input.internalRoutingId;
  }

  return buildTanqrPayload({
    poiMethod: input.poiMethod ?? '11',
    acquirerId5: input.acquirerId5,
    merchantId: input.merchantId,
    mcc: input.mcc,
    merchantName: input.merchantName,
    city: input.city,
    postalCode: input.postalCode,
    amount: input.amount,
    additionalData:
      Object.keys(additionalData).length > 0 ? additionalData : undefined,
  });
}

/**
 * Re-parses a built TANQR payload's own CRC by recomputing it from the payload
 * bytes and comparing to the CRC that's embedded in it. Used as a self-check
 * before persisting — catches builder bugs or data corruption before a bad
 * payload ever reaches a merchant's printed QR code.
 */
export function verifyTanqrCrc(tlvPayload: string, expectedCrc: string): boolean {
  if (tlvPayload.length < 8 || !tlvPayload.endsWith(expectedCrc)) return false;
  const withoutCrcValue = tlvPayload.slice(0, -4);
  if (!withoutCrcValue.endsWith('6304')) return false;
  return crc16(withoutCrcValue) === expectedCrc;
}
