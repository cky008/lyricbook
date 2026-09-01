export interface BookletSheet {
  index: number;
  front: [number, number];
  back: [number, number];
}

export function paddedBookletPageCount(pageCount: number): number {
  if (pageCount <= 0) return 4;
  return Math.ceil(pageCount / 4) * 4;
}

export function imposeBooklet(pageCount: number): BookletSheet[] {
  const total = paddedBookletPageCount(pageCount);
  const sheets: BookletSheet[] = [];
  let low = 1;
  let high = total;
  let index = 0;
  while (low < high) {
    sheets.push({
      index,
      front: [high, low],
      back: [low + 1, high - 1],
    });
    low += 2;
    high -= 2;
    index += 1;
  }
  return sheets;
}
