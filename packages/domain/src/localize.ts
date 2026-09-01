import type { LocalizedText, UiLocale } from "./types";

const FALLBACK_KEYS: Record<UiLocale, string[]> = {
  "en-US": ["en-US", "en", "zh-Hans", "zh-CN"],
  "zh-CN": ["zh-CN", "zh-Hans", "zh", "en-US", "en"],
};

export function getLocalized(value: LocalizedText | undefined, locale: UiLocale): string {
  if (!value) return "";
  for (const key of FALLBACK_KEYS[locale]) {
    const candidate = value[key]?.trim();
    if (candidate) return candidate;
  }
  return (
    Object.values(value)
      .find((candidate) => candidate.trim())
      ?.trim() ?? ""
  );
}

export function detectUiLocale(languages: readonly string[] = navigator.languages): UiLocale {
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh-CN" : "en-US";
}

export function languageDisplayName(language: string, locale: UiLocale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(language) ?? language;
  } catch {
    return language;
  }
}
