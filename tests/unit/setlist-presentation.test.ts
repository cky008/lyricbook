import { SETLIST_STATUSES, setlistStatusLabel } from "@app/lib/setlistPresentation";
import { describe, expect, it, vi } from "vitest";

describe("setlist status presentation", () => {
  it.each(SETLIST_STATUSES)("localizes known %s status for summaries and editors", (status) => {
    const t = vi.fn((key: string) => `Translated ${key}`);
    expect(setlistStatusLabel(status, t)).toBe(`Translated setlist-status-${status}`);
    expect(t).toHaveBeenCalledWith(`setlist-status-${status}`);
  });

  it("uses the localized draft label for a missing active setlist", () => {
    expect(setlistStatusLabel(undefined, () => "草稿")).toBe("草稿");
  });

  it("preserves unfamiliar imported status labels without leaking missing translation keys", () => {
    const t = vi.fn();
    expect(setlistStatusLabel("custom-tour-status", t)).toBe("custom-tour-status");
    expect(t).not.toHaveBeenCalled();
  });
});
