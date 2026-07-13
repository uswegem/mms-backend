/** Parse sub-tags inside EMVCo template tag 62 content. */
export function extractTag62SubTag(
  tlvPayload: string,
  subTag: string,
): string | null {
  const tag62Match = tlvPayload.match(/62(\d{2})(\d+)/);
  if (!tag62Match) return null;

  const content = tag62Match[2].slice(0, Number(tag62Match[1]));
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
