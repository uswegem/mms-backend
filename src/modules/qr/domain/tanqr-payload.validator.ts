import { crc16 } from './crc16';
import { TlvValidationError } from './tlv.builder';

const CRC_TAG_PATTERN = /^(.*)6304([0-9A-F]{4})$/i;

export interface TanqrFieldValidationInput {
  poiMethod: '11' | '12';
  acquirerId5: string;
  merchantId: string;
  mcc: string;
  merchantName: string;
  city: string;
  postalCode: string;
  amount?: string;
  storeLabel?: string;
  terminalLabel?: string;
  billNumber?: string;
  referenceLabel?: string;
}

export interface TanqrPayloadVerificationResult {
  valid: boolean;
  crcExpected?: string;
  crcActual?: string;
  poiMethod?: string;
  errors: string[];
}

export function validateAcquirerId5(acquirerId5: string): string {
  const normalized = acquirerId5.replace(/\D/g, '');
  if (!/^\d{5}$/.test(normalized)) {
    throw new TlvValidationError('Acquirer ID must be exactly 5 numeric digits');
  }
  return normalized;
}

export function validateMerchantId(merchantId: string): string {
  const normalized = merchantId.replace(/\D/g, '');
  if (!normalized) {
    throw new TlvValidationError('Merchant ID must be numeric');
  }
  if (normalized.length > 15) {
    throw new TlvValidationError('Merchant ID must not exceed 15 digits');
  }
  return normalized;
}

export function validateMccCode(mcc: string, allowDefault = true): string {
  const normalized = mcc.replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  if (!/^\d{4}$/.test(normalized)) {
    throw new TlvValidationError('MCC must be a 4-digit numeric code');
  }
  if (!allowDefault && normalized === '0000') {
    throw new TlvValidationError('MCC 0000 is only allowed when unavailable');
  }
  return normalized;
}

export function validateMerchantName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new TlvValidationError('Merchant name is required');
  }
  if (trimmed.length > 25) {
    throw new TlvValidationError('Merchant name must not exceed 25 characters');
  }
  return trimmed;
}

export function validateMerchantCity(city: string): string {
  const trimmed = city.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new TlvValidationError('Merchant city is required');
  }
  if (trimmed.length > 15) {
    throw new TlvValidationError('Merchant city must not exceed 15 characters');
  }
  return trimmed;
}

export function validatePostalCodeValue(postalCode: string): string {
  const digits = postalCode.replace(/\D/g, '');
  if (!/^\d{5}$/.test(digits)) {
    throw new TlvValidationError('Postal code must be exactly 5 numeric digits');
  }
  return digits;
}

export function validateTransactionAmount(amount: string): string {
  const raw = amount.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new TlvValidationError(
      'Amount must be numeric and may contain one decimal point',
    );
  }
  if (Number(raw) <= 0) {
    throw new TlvValidationError('Amount must be greater than zero');
  }
  return raw;
}

export function validateTag62Content(value: string): void {
  if (value.length > 99) {
    throw new TlvValidationError('Tag 62 must not exceed 99 characters');
  }
}

export function validateTanqrFieldInput(
  input: TanqrFieldValidationInput,
): TanqrFieldValidationInput {
  validateAcquirerId5(input.acquirerId5);
  validateMerchantId(input.merchantId);
  validateMccCode(input.mcc);
  validateMerchantName(input.merchantName);
  validateMerchantCity(input.city);
  validatePostalCodeValue(input.postalCode);

  if (input.poiMethod === '12') {
    if (!input.amount) {
      throw new TlvValidationError('Dynamic QR requires transaction amount (tag 54)');
    }
    validateTransactionAmount(input.amount);
  }

  const tag62Parts = [
    input.billNumber,
    input.storeLabel,
    input.referenceLabel,
    input.terminalLabel,
  ].filter(Boolean);
  if (tag62Parts.some((part) => part!.length > 25)) {
    throw new TlvValidationError('Tag 62 sub-fields must not exceed 25 characters');
  }

  return input;
}

/** Verify CRC tag 63 on a complete TANQR payload string. */
export function verifyTanqrPayload(tlvPayload: string): TanqrPayloadVerificationResult {
  const errors: string[] = [];

  if (!tlvPayload || tlvPayload.length < 8) {
    return { valid: false, errors: ['Payload is too short'] };
  }

  const match = tlvPayload.match(CRC_TAG_PATTERN);
  if (!match) {
    return { valid: false, errors: ['Payload must end with tag 63 CRC (6304XXXX)'] };
  }

  const [, body, crcActual] = match;
  const crcExpected = crc16(`${body}6304`);

  if (crcActual.toUpperCase() !== crcExpected) {
    errors.push(`CRC mismatch: expected ${crcExpected}, got ${crcActual.toUpperCase()}`);
  }

  const poiMatch = body.match(/0102(11|12)/);
  const poiMethod = poiMatch?.[1];

  if (!body.startsWith('000201')) {
    errors.push('Payload format indicator (tag 00) must be 01');
  }
  if (!poiMethod) {
    errors.push('Point of initiation method (tag 01) must be 11 or 12');
  }
  if (!body.includes('26390014tz.go.bot.tips')) {
    errors.push('TIPS merchant account template (tag 26) is missing or invalid');
  }

  return {
    valid: errors.length === 0,
    crcExpected,
    crcActual: crcActual.toUpperCase(),
    poiMethod,
    errors,
  };
}
