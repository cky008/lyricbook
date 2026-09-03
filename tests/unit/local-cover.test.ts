import { describe, expect, it } from "vitest";
import { sniffCoverImageType } from "@app/lib/localCover";

describe("local print cover images", () => {
  it("recognizes the supported raster signatures", () => {
    expect(
      sniffCoverImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(sniffCoverImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      sniffCoverImageType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe("image/webp");
  });

  it("rejects SVG, GIF, and mislabeled bytes", () => {
    expect(
      sniffCoverImageType(new TextEncoder().encode("<svg onload='alert(1)'>")),
    ).toBeUndefined();
    expect(sniffCoverImageType(new TextEncoder().encode("GIF89a"))).toBeUndefined();
    expect(sniffCoverImageType(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
  });
});
