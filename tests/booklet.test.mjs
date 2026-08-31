import test from "node:test";
import assert from "node:assert/strict";

function booklet(totalPages) {
  if (!Number.isInteger(totalPages) || totalPages <= 0 || totalPages % 4) throw new Error("multiple of four");
  const result = [];
  let low = 1, high = totalPages;
  while (low < high) { result.push([high, low, low + 1, high - 1]); low += 2; high -= 2; }
  return result;
}

test("booklet imposition orders eight logical pages", () => {
  assert.deepEqual(booklet(8), [[8,1,2,7],[6,3,4,5]]);
});

test("booklet imposition rejects unpadded counts", () => {
  assert.throws(() => booklet(6), /multiple of four/);
});
