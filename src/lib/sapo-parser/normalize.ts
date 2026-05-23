/**
 * Vietnamese text normalization utilities.
 * Must match the Python normalize() function exactly.
 *
 * Python reference:
 *   def normalize(s):
 *     if not s: return ''
 *     s = str(s).lower().strip()
 *     s = unicodedata.normalize('NFD', s)
 *     s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')  # remove diacritics
 *     s = s.replace('đ', 'd')
 *     s = re.sub(r'[_\-/,]', ' ', s)
 *     s = re.sub(r'\s+', ' ', s)
 *     return s.strip()
 *
 * Tests:
 *   normalize("page_HuyK - Kim Hoàn")            === "page huyk kim hoan"
 *   normalize("tiktok_business_HuyK- Xưởng Vàng Bạc 2") === "tiktok business huyk xuong vang bac 2"
 *   normalize("Đổi hàng không thu cod")           === "doi hang khong thu cod"
 */
export function normalize(s: string): string {
  if (!s) return ''

  // Step 1: lowercase and trim
  let result = String(s).toLowerCase().trim()

  // Step 2: NFD decomposition — splits combined characters into base + diacritic marks
  result = result.normalize('NFD')

  // Step 3: Remove all Unicode "Mark, Nonspacing" (Mn) category characters (the diacritic marks)
  // This removes all combining diacritic marks left over after NFD decomposition
  result = result.replace(/\p{Mn}/gu, '')

  // Step 4: Replace "đ" (the standalone letter that was not decomposed) with "d"
  // After NFD + Mn removal, "đ" remains because it doesn't decompose via NFD
  result = result.replace(/đ/g, 'd')

  // Step 5: Replace separators [_, -, /, ,] with a space
  result = result.replace(/[_\-/,]/g, ' ')

  // Step 6: Collapse multiple spaces to a single space
  result = result.replace(/\s+/g, ' ')

  return result.trim()
}

/**
 * Check whether a normalized string contains another as a substring,
 * with the length-difference guard used in Python's fuzzy matching.
 * abs(len(key) - len(tag)) < 30
 */
export function fuzzyContains(key: string, tag: string): boolean {
  if (!key || key.length <= 5) return false
  if (Math.abs(key.length - tag.length) >= 30) return false
  return key.includes(tag) || tag.includes(key)
}
