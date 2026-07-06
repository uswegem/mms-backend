/** CRC16-CCITT-FALSE (EMVCo / TANQR tag 63). */
export function crc16(payloadPlus6304: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payloadPlus6304.length; i++) {
    crc ^= payloadPlus6304.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
