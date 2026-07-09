import { buildEightDigitId, validateDamm } from './damm';

/**
 * Build TANQR feature-phone Alias Merchant ID (AAA-CCCC-S without hyphens).
 * - 3-digit acquirer code
 * - 4-digit merchant code
 * - 1 Damm checksum digit
 */
export function buildAliasMerchantId(
  acquirerCode: string,
  merchantCode: string,
): string {
  const acquirer = acquirerCode.replace(/\D/g, '').padStart(3, '0').slice(-3);
  const merchant = merchantCode.replace(/\D/g, '').padStart(4, '0').slice(-4);
  return buildEightDigitId(acquirer, merchant);
}

export function validateAliasMerchantId(alias: string): boolean {
  return validateDamm(alias);
}
