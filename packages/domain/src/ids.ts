export function slugify(value: string, fallback = "item"): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function createId(prefix: string, label = ""): string {
  const slug = slugify(label, prefix);
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${slug}-${random[0]?.toString(36)}${random[1]?.toString(36)}`;
}

export function normalizeSongLookup(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[《》〈〉「」『』“”‘’'"()（）[\]【】.,，。:：;；!?！？/\\\s_-]+/g, "")
    .trim();
}
