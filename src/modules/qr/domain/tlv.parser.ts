function extractNestedSubTag(
  tlvPayload: string,
  parentTag: string,
  subTag: string,
): string | null {
  // Capture only the 2-digit length here — the content itself is sliced by
  // that declared length below, not matched via a digit-only regex, since
  // sub-fields (e.g. an alphanumeric terminal label) aren't guaranteed to
  // be numeric.
  const parentMatch = tlvPayload.match(new RegExp(`${parentTag}(\\d{2})`));
  if (!parentMatch || parentMatch.index === undefined) return null;

  const length = Number(parentMatch[1]);
  const contentStart = parentMatch.index + parentMatch[0].length;
  const content = tlvPayload.slice(contentStart, contentStart + length);
  if (content.length < length) return null;
  let index = 0;

  while (index + 4 <= content.length) {
    const id = content.slice(index, index + 2);
    const len = Number(content.slice(index + 2, index + 4));
    if (!Number.isFinite(len) || len < 0) return null;
    const value = content.slice(index + 4, index + 4 + len);
    if (id === subTag) return value;
    index += 4 + len;
  }

  return null;
}

/** Parse sub-tags inside EMVCo template tag 62 (Additional Data) content. */
export function extractTag62SubTag(
  tlvPayload: string,
  subTag: string,
): string | null {
  return extractNestedSubTag(tlvPayload, '62', subTag);
}

/** Parse sub-tags inside TIPS Merchant Account template tag 26 content —
 * e.g. subTag '02' for the 15-digit bank Merchant ID. */
export function extractTag26SubTag(
  tlvPayload: string,
  subTag: string,
): string | null {
  return extractNestedSubTag(tlvPayload, '26', subTag);
}
