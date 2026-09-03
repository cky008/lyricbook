import { FluentBundle, FluentResource, type FluentVariable } from "@fluent/bundle";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { detectUiLocale, type UiLocale } from "@domain/index";

interface I18nContextValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (id: string, args?: Record<string, FluentVariable>) => string;
  ready: boolean;
}

const FALLBACK: Record<UiLocale, Record<string, string>> = {
  "en-US": {
    "app-name": "LyricBook",
    library: "Library",
    setlist: "Setlist",
    theme: "Theme",
    import: "Import",
    export: "Export",
    print: "Print",
    search: "Search songs",
    "more-actions": "More actions",
  },
  "zh-CN": {
    "app-name": "LyricBook",
    library: "曲库",
    setlist: "歌单",
    theme: "主题",
    import: "导入",
    export: "导出",
    print: "打印",
    search: "搜索歌曲",
    "more-actions": "更多操作",
  },
};

const I18nContext = createContext<I18nContextValue | null>(null);

function localeUrl(locale: UiLocale): URL {
  return new URL(`locales/${locale}/main.ftl`, document.baseURI);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(() => {
    const stored = localStorage.getItem("lyricbook-ui-locale");
    return stored === "zh-CN" || stored === "en-US" ? stored : detectUiLocale();
  });
  const [bundle, setBundle] = useState<FluentBundle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    fetch(localeUrl(locale), { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load locale ${locale}`);
        return response.text();
      })
      .then((source) => {
        if (cancelled) return;
        const next = new FluentBundle(locale, { useIsolating: false });
        const errors = next.addResource(new FluentResource(source), { allowOverrides: false });
        if (errors.length) console.warn("Fluent catalog warnings", errors);
        setBundle(next);
        document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
        setReady(true);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          setBundle(null);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: UiLocale) => {
    localStorage.setItem("lyricbook-ui-locale", next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (id: string, args?: Record<string, FluentVariable>) => {
      const message = bundle?.getMessage(id);
      if (message?.value) {
        const errors: Error[] = [];
        const value = bundle?.formatPattern(message.value, args, errors);
        if (errors.length) console.warn(`Fluent formatting issue for ${id}`, errors);
        if (value) return value;
      }
      return FALLBACK[locale][id] ?? id;
    },
    [bundle, locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, ready }),
    [locale, ready, setLocale, t],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const context = use(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
