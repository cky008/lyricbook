import { describe, expect, it } from "vitest";
import { imposeBooklet, paddedBookletPageCount } from "@print/index";

describe("booklet imposition", () => {
  it("pads to four and imposes eight pages", () => {
    expect(paddedBookletPageCount(5)).toBe(8);
    expect(imposeBooklet(8)).toEqual([
      { index: 0, front: [8, 1], back: [2, 7] },
      { index: 1, front: [6, 3], back: [4, 5] },
    ]);
  });
});
