import { crc16CcittFalse } from './crc16.util';

export interface StaticTanqrInput {
  merchantName: string;
  city: string;
  postalCode: string;
  mcc: string;
  publicAlias: string;
  internalRoutingId?: string;
  poiMethod?: '11' | '12';
  amount?: string;
  billNumber?: string;
}

function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

function nestedTlv(parentTag: string, children: string): string {
  return tlv(parentTag, children);
}

export function buildStaticTanqrPayload(input: StaticTanqrInput): {
  tlvPayload: string;
  crcValue: string;
} {
  const poi = input.poiMethod ?? '11';
  const merchantAccount = tlv('00', 'TZ.TIPS');
  const aliasSub = tlv('02', input.publicAlias);
  const tag26 = nestedTlv('26', merchantAccount + aliasSub);

  const parts = [
    tlv('00', '01'),
    tlv('01', poi),
    tlv('52', input.mcc.padStart(4, '0').slice(0, 4)),
    tlv('53', '834'),
    tlv('58', 'TZ'),
    tlv('59', input.merchantName.slice(0, 25)),
    tlv('60', input.city.slice(0, 15)),
    tlv('61', input.postalCode.slice(0, 10)),
    tag26,
  ];

  if (input.internalRoutingId) {
    parts.push(nestedTlv('62', tlv('05', input.internalRoutingId)));
  }
  if (input.amount) {
    parts.push(tlv('54', input.amount));
  }
  if (input.billNumber) {
    parts.push(nestedTlv('62', tlv('01', input.billNumber)));
  }

  const withoutCrc = parts.join('') + tlv('63', '');
  const crc = crc16CcittFalse(withoutCrc);
  const tlvPayload = parts.join('') + tlv('63', crc);
  return { tlvPayload, crcValue: crc };
}
