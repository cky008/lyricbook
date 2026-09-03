import packageJson from "../../package.json";
import { localeUrl } from "@app/lib/i18n";
import { describe, expect, it } from "vitest";

describe("locale catalog URLs", () => {
  it("fingerprints locale requests so a previously installed worker cannot return an older catalog", () => {
    const url = localeUrl("en-US", "https://example.test/lyricbook/");

    expect(url.pathname).toBe("/lyricbook/locales/en-US/main.ftl");
    expect(url.searchParams.get("v")).toBe(packageJson.version);
  });
});
