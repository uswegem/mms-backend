/** Parse sub-tags inside EMVCo template tag 62 content. */
export function extractTag62SubTag(
  tlvPayload: string,
  subTag: string,
): string | null {
  // Capture only the 2-digit length here — the content itself is sliced by
  // that declared length below, not matched via a digit-only regex, since
  // tag 62 sub-fields (e.g. an alphanumeric terminal label) aren't
  // guaranteed to be numeric.
  const tag62Match = tlvPayload.match(/62(\d{2})/);
  if (!tag62Match || tag62Match.index === undefined) return null;

  const length = Number(tag62Match[1]);
  const contentStart = tag62Match.index + tag62Match[0].length;
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
