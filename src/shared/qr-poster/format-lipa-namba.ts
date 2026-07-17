/** Groups digits left-to-right in blocks of 4. "7800000026" → "7800 0000 26" */
export function formatLipaNamba(value: string): string {
  return value.replace(/(\d{4})(?=\d)/g, '$1 ');
}
