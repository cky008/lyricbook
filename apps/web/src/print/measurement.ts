import {
  imposeBooklet,
  paddedBookletPageCount,
  type LogicalPrintPage,
  type PrintPlan,
  type SongPage,
  type TocDensity,
  type TocPage,
  type TocSection,
} from "@print/index";

const LAYOUT_TOLERANCE_PX = 1;
const MIN_FOOTER_CLEARANCE_MM = 2;
const CSS_PIXELS_PER_MM = 96 / 25.4;
const FONT_STEP_PT = 0.25;
const TOC_COLUMN_GAP_MM = 8;
const TOC_PACKING_RESERVE_MM = 2;

export type PrintIssueCode =
  | "missing-page"
  | "missing-inner"
  | "missing-content"
  | "missing-footer"
  | "page-horizontal-overflow"
  | "page-vertical-overflow"
  | "inner-horizontal-overflow"
  | "inner-vertical-overflow"
  | "inner-outside-page"
  | "content-horizontal-overflow"
  | "content-vertical-overflow"
  | "content-outside-inner"
  | "body-horizontal-overflow"
  | "body-vertical-overflow"
  | "footer-outside-inner"
  | "footer-clearance";

export interface PrintIssue {
  code: PrintIssueCode;
  message: string;
  actual?: number;
  limit?: number;
}

export interface BoxMetrics {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  overflowX: boolean;
  overflowY: boolean;
}

export interface PageSafety {
  pageId: string;
  kind: LogicalPrintPage["kind"];
  safe: boolean;
  fontSize?: number;
  footerClearance?: number;
  issues: PrintIssue[];
  boxes: {
    page?: BoxMetrics;
    inner?: BoxMetrics;
    content?: BoxMetrics;
    body?: BoxMetrics;
    footer?: BoxMetrics;
  };
}

export interface PrintSafetyReport {
  safe: boolean;
  pages: PageSafety[];
  issues: Array<PrintIssue & { pageId: string }>;
}

export interface MeasuredPrintPlan {
  plan: PrintPlan;
  report: PrintSafetyReport;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  signal.throwIfAborted();
}

function abortError(): DOMException {
  return new DOMException("Print layout measurement was aborted", "AbortError");
}

function awaitWithSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function nextAnimationFrame(document: Document, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  const view = document.defaultView;
  return new Promise<void>((resolve, reject) => {
    let frame = 0;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      if (frame && view) view.cancelAnimationFrame(frame);
      if (timer !== undefined) globalThis.clearTimeout(timer);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.reason ?? abortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (view && typeof view.requestAnimationFrame === "function") {
      frame = view.requestAnimationFrame(finish);
    } else {
      timer = globalThis.setTimeout(finish, 0);
    }
  });
}

/** Wait for loaded fonts and two painted frames before reading print geometry. */
export async function waitForStableLayout(root: HTMLElement, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const fonts = root.ownerDocument.fonts;
  if (fonts) await awaitWithSignal(fonts.ready, signal);
  await nextAnimationFrame(root.ownerDocument, signal);
  await nextAnimationFrame(root.ownerDocument, signal);
  throwIfAborted(signal);
}

function metricsFor(element: HTMLElement): BoxMetrics {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    overflowX: element.scrollWidth > element.clientWidth + LAYOUT_TOLERANCE_PX,
    overflowY: element.scrollHeight > element.clientHeight + LAYOUT_TOLERANCE_PX,
  };
}

function unionMetrics(elements: HTMLElement[]): BoxMetrics | undefined {
  const visible = elements
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 || rect.height > 0);
  if (!visible.length) return undefined;

  const left = Math.min(...visible.map(({ rect }) => rect.left));
  const top = Math.min(...visible.map(({ rect }) => rect.top));
  const right = Math.max(...visible.map(({ rect }) => rect.right));
  const bottom = Math.max(...visible.map(({ rect }) => rect.bottom));
  const scrollWidth = Math.max(...visible.map(({ element }) => element.scrollWidth));
  const scrollHeight = Math.max(...visible.map(({ element }) => element.scrollHeight));
  const clientWidth = Math.max(...visible.map(({ element }) => element.clientWidth));
  const clientHeight = Math.max(...visible.map(({ element }) => element.clientHeight));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    clientWidth,
    clientHeight,
    scrollWidth,
    scrollHeight,
    overflowX: visible.some(
      ({ element }) => element.scrollWidth > element.clientWidth + LAYOUT_TOLERANCE_PX,
    ),
    overflowY: visible.some(
      ({ element }) => element.scrollHeight > element.clientHeight + LAYOUT_TOLERANCE_PX,
    ),
  };
}

function renderedPages(root: HTMLElement): Map<string, HTMLElement> {
  const result = new Map<string, HTMLElement>();
  for (const element of root.querySelectorAll<HTMLElement>("[data-print-page-id]")) {
    const id = element.dataset.printPageId;
    if (id && !result.has(id)) result.set(id, element);
  }
  return result;
}

function renderedSongContent(root: HTMLElement, pageId: string): HTMLElement | undefined {
  for (const element of root.querySelectorAll<HTMLElement>("[data-song-page-id]")) {
    if (element.dataset.songPageId === pageId) return element;
  }
  return undefined;
}

interface TocCandidate {
  columns: number;
  density: TocDensity;
}

interface MeasuredTocSection {
  headingHeight: number;
  entryHeights: number[];
}

interface PackedTocCandidate extends TocCandidate {
  columnPages: TocSection[][][];
}

function tocCandidates(plan: PrintPlan): TocCandidate[] {
  return plan.format === "a4"
    ? [
        { columns: 1, density: "relaxed" },
        { columns: 2, density: "standard" },
        { columns: 3, density: "compact" },
      ]
    : [
        { columns: 1, density: "relaxed" },
        { columns: 2, density: "standard" },
      ];
}

function tocBaseTitle(title: string): string {
  return title.replace(/(?:（续）| \(continued\))$/u, "");
}

function tocContinuationTitle(baseTitle: string): string {
  return /[\u3400-\u9fff]/u.test(baseTitle) ? `${baseTitle}（续）` : `${baseTitle} (continued)`;
}

function collectedTocSections(pages: TocPage[]): TocSection[] {
  const sections: TocSection[] = [];
  for (const page of pages.toSorted((left, right) => left.pageInToc - right.pageInToc)) {
    for (const column of page.columnSections) {
      for (const section of column) {
        const previous = sections.at(-1);
        if (previous?.label === section.label) {
          previous.entries.push(...section.entries.map((entry) => ({ ...entry })));
        } else {
          sections.push({
            label: section.label,
            entries: section.entries.map((entry) => ({ ...entry })),
          });
        }
      }
    }
  }
  return sections;
}

function outerHeight(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const marginTop = Number.parseFloat(style?.marginTop ?? "0") || 0;
  const marginBottom = Number.parseFloat(style?.marginBottom ?? "0") || 0;
  return element.getBoundingClientRect().height + marginTop + marginBottom;
}

function createTocSectionElement(document: Document, section: TocSection): HTMLElement {
  const container = document.createElement("section");
  container.className = "print-toc-section";
  const heading = document.createElement("h3");
  heading.textContent = section.label;
  container.append(heading);
  for (const entry of section.entries) {
    const link = document.createElement("a");
    link.className = "print-toc-entry";
    link.dataset.tocSongId = entry.songId;
    link.href = `#print-song-${entry.songId}`;
    for (const value of [
      String(entry.sequence).padStart(2, "0"),
      entry.title,
      String(entry.pageNumber),
    ]) {
      const span = document.createElement("span");
      span.textContent = value;
      link.append(span);
    }
    container.append(link);
  }
  return container;
}

function packMeasuredToc(
  sections: TocSection[],
  measurements: MeasuredTocSection[],
  candidate: TocCandidate,
  availableHeight: number,
): TocSection[][][] {
  const columns: TocSection[][] = [[]];
  const usedHeights = [0];
  const nextColumn = () => {
    columns.push([]);
    usedHeights.push(0);
  };

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const measured = measurements[sectionIndex];
    if (!section || !measured) continue;
    for (let entryIndex = 0; entryIndex < section.entries.length; entryIndex += 1) {
      const entry = section.entries[entryIndex];
      if (!entry) continue;
      let columnIndex = columns.length - 1;
      let column = columns[columnIndex];
      let used = usedHeights[columnIndex] ?? 0;
      if (!column) continue;
      let targetSection = column.at(-1);
      let startsSection = targetSection?.label !== section.label;
      let height =
        (measured.entryHeights[entryIndex] ?? 0) + (startsSection ? measured.headingHeight : 0);

      if (column.length && used + height > availableHeight) {
        nextColumn();
        columnIndex = columns.length - 1;
        column = columns[columnIndex];
        used = usedHeights[columnIndex] ?? 0;
        if (!column) continue;
        targetSection = undefined;
        startsSection = true;
        height = (measured.entryHeights[entryIndex] ?? 0) + measured.headingHeight;
      }

      if (startsSection) {
        targetSection = { label: section.label, entries: [] };
        column.push(targetSection);
      }
      targetSection?.entries.push({ ...entry });
      usedHeights[columnIndex] = used + height;
    }
  }

  const pageCount = Math.max(1, Math.ceil(columns.length / candidate.columns));
  while (columns.length < pageCount * candidate.columns) columns.push([]);
  return Array.from({ length: pageCount }, (_, pageIndex) =>
    columns.slice(pageIndex * candidate.columns, (pageIndex + 1) * candidate.columns),
  );
}

function measureTocCandidate(
  root: HTMLElement,
  templatePage: HTMLElement,
  title: string,
  sections: TocSection[],
  candidate: TocCandidate,
): PackedTocCandidate | undefined {
  const page = templatePage.cloneNode(true) as HTMLElement;
  page.removeAttribute("id");
  page.removeAttribute("data-print-page-id");
  page.style.position = "absolute";
  page.style.inset = "0 auto auto 0";
  page.style.visibility = "hidden";
  page.style.pointerEvents = "none";
  page.style.zIndex = "-1";
  const content = page.querySelector<HTMLElement>("[data-print-content='toc']");
  const heading = page.querySelector<HTMLElement>(".print-toc-title");
  const columns = page.querySelector<HTMLElement>(".print-toc-columns");
  if (!content || !heading || !columns) return undefined;

  content.className = `print-page-content print-toc-content toc-density-${candidate.density}`;
  heading.textContent = title;
  columns.replaceChildren();
  columns.style.display = "block";
  columns.style.width = "100%";
  const measureColumn = page.ownerDocument.createElement("div");
  measureColumn.className = "print-toc-column";
  columns.append(measureColumn);
  root.append(page);

  try {
    const contentWidth = content.clientWidth;
    const gap = TOC_COLUMN_GAP_MM * CSS_PIXELS_PER_MM;
    const columnWidth =
      (contentWidth - gap * Math.max(0, candidate.columns - 1)) / candidate.columns;
    measureColumn.style.width = `${Math.max(1, columnWidth)}px`;
    const elements = sections.map((section) =>
      createTocSectionElement(page.ownerDocument, section),
    );
    measureColumn.replaceChildren(...elements);

    const contentRect = content.getBoundingClientRect();
    const columnsRect = columns.getBoundingClientRect();
    const availableHeight =
      contentRect.bottom - columnsRect.top - TOC_PACKING_RESERVE_MM * CSS_PIXELS_PER_MM;
    if (availableHeight <= 0) return undefined;
    const measurements = elements.map<MeasuredTocSection>((element) => {
      const elementHeading = element.querySelector<HTMLElement>("h3");
      const entryElements = Array.from(element.querySelectorAll<HTMLElement>(".print-toc-entry"));
      const sectionStyle = element.ownerDocument.defaultView?.getComputedStyle(element);
      const sectionMargin = Number.parseFloat(sectionStyle?.marginBottom ?? "0") || 0;
      return {
        headingHeight: (elementHeading ? outerHeight(elementHeading) : 0) + sectionMargin,
        entryHeights: entryElements.map(outerHeight),
      };
    });
    return {
      ...candidate,
      columnPages: packMeasuredToc(sections, measurements, candidate, availableHeight),
    };
  } finally {
    page.remove();
  }
}

function assignTocPageNumbers(pages: LogicalPrintPage[]): void {
  const firstSongPage = new Map<string, number>();
  pages.forEach((page, index) => {
    if (page.kind === "song" && !firstSongPage.has(page.songId)) {
      firstSongPage.set(page.songId, index + 1);
    }
  });
  for (const page of pages) {
    if (page.kind !== "toc") continue;
    for (const column of page.columnSections) {
      for (const section of column) {
        for (const entry of section.entries) {
          entry.pageNumber = firstSongPage.get(entry.songId) ?? entry.pageNumber;
        }
      }
    }
    page.sections = page.columnSections.flat();
  }
}

function withMeasuredToc(root: HTMLElement, plan: PrintPlan): PrintPlan {
  const tocPages = plan.pages.filter((page): page is TocPage => page.kind === "toc");
  if (!tocPages.length) return plan;
  const templatePage = renderedPages(root).get(tocPages[0]?.id ?? "");
  if (!templatePage) return plan;
  const sections = collectedTocSections(tocPages);
  const baseTitle = tocBaseTitle(tocPages[0]?.title ?? "Setlist contents");
  let measured: PackedTocCandidate | undefined;
  for (const candidate of tocCandidates(plan)) {
    const next = measureTocCandidate(root, templatePage, baseTitle, sections, candidate);
    if (!next) continue;
    measured = next;
    if (next.columnPages.length === 1) break;
  }
  if (!measured) return plan;

  const rebuiltTocPages = measured.columnPages.map<TocPage>((columnSections, index, pages) => ({
    kind: "toc",
    id: `print-toc-${index + 1}`,
    title: index === 0 ? baseTitle : tocContinuationTitle(baseTitle),
    sections: columnSections.flat(),
    columns: measured.columns,
    density: measured.density,
    columnSections,
    pageInToc: index + 1,
    pageCountForToc: pages.length,
    continuation: index > 0,
  }));
  const firstTocIndex = plan.pages.findIndex((page) => page.kind === "toc");
  const beforeToc = plan.pages
    .slice(0, firstTocIndex)
    .filter((page) => page.kind !== "blank" && page.kind !== "toc");
  const afterToc = plan.pages
    .slice(firstTocIndex)
    .filter((page) => page.kind !== "blank" && page.kind !== "toc");
  const pages: LogicalPrintPage[] = [...beforeToc, ...rebuiltTocPages, ...afterToc];
  const paddedPageCount =
    plan.format === "booklet" ? paddedBookletPageCount(pages.length) : pages.length;
  while (pages.length < paddedPageCount) {
    pages.push({ kind: "blank", id: `blank-${pages.length + 1}` });
  }
  assignTocPageNumbers(pages);
  return {
    ...plan,
    pages,
    paddedPageCount,
    bookletSheets: plan.format === "booklet" ? imposeBooklet(pages.length) : [],
  };
}

function issue(
  issues: PrintIssue[],
  code: PrintIssueCode,
  message: string,
  actual?: number,
  limit?: number,
): void {
  issues.push({ code, message, actual, limit });
}

function addOverflowIssues(
  issues: PrintIssue[],
  box: BoxMetrics,
  horizontal: PrintIssueCode,
  vertical: PrintIssueCode,
  label: string,
): void {
  if (box.overflowX) {
    issue(
      issues,
      horizontal,
      `${label} is wider than its available region`,
      box.scrollWidth,
      box.clientWidth,
    );
  }
  if (box.overflowY) {
    issue(
      issues,
      vertical,
      `${label} is taller than its available region`,
      box.scrollHeight,
      box.clientHeight,
    );
  }
}

function isInside(inner: BoxMetrics, outer: BoxMetrics): boolean {
  return (
    inner.left >= outer.left - LAYOUT_TOLERANCE_PX &&
    inner.top >= outer.top - LAYOUT_TOLERANCE_PX &&
    inner.right <= outer.right + LAYOUT_TOLERANCE_PX &&
    inner.bottom <= outer.bottom + LAYOUT_TOLERANCE_PX
  );
}

function inspectPage(pageElement: HTMLElement, page: LogicalPrintPage): PageSafety {
  const issues: PrintIssue[] = [];
  const pageBox = metricsFor(pageElement);
  const innerElement = pageElement.querySelector<HTMLElement>("[data-print-inner]");
  const contentElement = pageElement.querySelector<HTMLElement>("[data-print-content]");
  const footerElement = pageElement.querySelector<HTMLElement>("[data-print-footer]");
  const innerBox = innerElement ? metricsFor(innerElement) : undefined;
  const contentBox = contentElement ? metricsFor(contentElement) : undefined;
  const footerBox = footerElement ? metricsFor(footerElement) : undefined;
  const bodyBox =
    contentElement && page.kind !== "cover"
      ? unionMetrics(Array.from(contentElement.querySelectorAll<HTMLElement>("*")))
      : undefined;

  addOverflowIssues(issues, pageBox, "page-horizontal-overflow", "page-vertical-overflow", "Page");

  if (!innerElement || !innerBox) {
    issue(issues, "missing-inner", "The printable page has no inner safety region");
  } else {
    addOverflowIssues(
      issues,
      innerBox,
      "inner-horizontal-overflow",
      "inner-vertical-overflow",
      "Inner page",
    );
    if (!isInside(innerBox, pageBox)) {
      issue(issues, "inner-outside-page", "The inner safety region extends outside the page");
    }
  }

  if (!contentElement || !contentBox) {
    issue(issues, "missing-content", "The printable page has no content region");
  } else {
    addOverflowIssues(
      issues,
      contentBox,
      "content-horizontal-overflow",
      "content-vertical-overflow",
      "Content",
    );
    if (innerBox && !isInside(contentBox, innerBox)) {
      issue(issues, "content-outside-inner", "The content region extends outside the inner page");
    }
    if (bodyBox) {
      if (
        bodyBox.left < contentBox.left - LAYOUT_TOLERANCE_PX ||
        bodyBox.right > contentBox.right + LAYOUT_TOLERANCE_PX ||
        bodyBox.overflowX
      ) {
        issue(
          issues,
          "body-horizontal-overflow",
          "Rendered content extends beyond the horizontal content boundary",
          Math.max(bodyBox.right - contentBox.right, contentBox.left - bodyBox.left, 0),
          0,
        );
      }
      if (
        bodyBox.top < contentBox.top - LAYOUT_TOLERANCE_PX ||
        bodyBox.bottom > contentBox.bottom + LAYOUT_TOLERANCE_PX ||
        bodyBox.overflowY
      ) {
        issue(
          issues,
          "body-vertical-overflow",
          "Rendered content extends beyond the vertical content boundary",
          Math.max(bodyBox.bottom - contentBox.bottom, contentBox.top - bodyBox.top, 0),
          0,
        );
      }
    }
  }

  if (page.kind !== "cover" && (!footerElement || !footerBox)) {
    issue(issues, "missing-footer", "The printable page has no footer safety region");
  }
  if (footerBox && innerBox && !isInside(footerBox, innerBox)) {
    issue(issues, "footer-outside-inner", "The footer extends outside the inner page");
  }

  const footerClearance = bodyBox && footerBox ? footerBox.top - bodyBox.bottom : undefined;
  const requiredClearance = MIN_FOOTER_CLEARANCE_MM * CSS_PIXELS_PER_MM;
  if (footerClearance !== undefined && footerClearance + LAYOUT_TOLERANCE_PX < requiredClearance) {
    issue(
      issues,
      "footer-clearance",
      "Rendered content is less than 2 mm from the footer",
      footerClearance,
      requiredClearance,
    );
  }

  return {
    pageId: page.id,
    kind: page.kind,
    safe: issues.length === 0,
    fontSize: page.kind === "song" ? page.fontSize : undefined,
    footerClearance,
    issues,
    boxes: {
      page: pageBox,
      inner: innerBox,
      content: contentBox,
      body: bodyBox,
      footer: footerBox,
    },
  };
}

function inspectPlan(root: HTMLElement, plan: PrintPlan): PrintSafetyReport {
  const pageElements = renderedPages(root);
  const pages = plan.pages.map<PageSafety>((page) => {
    const pageElement = pageElements.get(page.id);
    if (pageElement) return inspectPage(pageElement, page);
    const missing: PrintIssue = {
      code: "missing-page",
      message: `No rendered page was found for ${page.id}`,
    };
    return {
      pageId: page.id,
      kind: page.kind,
      safe: false,
      fontSize: page.kind === "song" ? page.fontSize : undefined,
      issues: [missing],
      boxes: {},
    };
  });
  return {
    safe: pages.every((page) => page.safe),
    pages,
    issues: pages.flatMap((page) =>
      page.issues.map((pageIssue) => ({ ...pageIssue, pageId: page.pageId })),
    ),
  };
}

function clonePlan(draft: PrintPlan): PrintPlan {
  return {
    ...draft,
    pages: draft.pages.map((page) =>
      page.kind === "song"
        ? { ...page, tracks: page.tracks.map((track) => ({ ...track })) }
        : { ...page },
    ),
    bookletSheets: draft.bookletSheets.map((sheet) => ({
      ...sheet,
      front: [...sheet.front],
      back: [...sheet.back],
    })),
  };
}

function pointSize(quarterPoints: number): number {
  return quarterPoints * FONT_STEP_PT;
}

function setSongFont(content: HTMLElement, fontSize: number): void {
  content.style.setProperty("--print-font-size", `${fontSize}pt`);
}

function songFits(pageElement: HTMLElement, content: HTMLElement, page: SongPage): boolean {
  setSongFont(content, page.fontSize);
  return inspectPage(pageElement, page).safe;
}

function resolveSongPage(
  pageElement: HTMLElement,
  content: HTMLElement,
  page: SongPage,
  signal: AbortSignal | undefined,
): SongPage {
  const minimum = Math.min(page.minFontSize, page.maxFontSize);
  const maximum = Math.max(page.minFontSize, page.maxFontSize);
  const minimumQuarterPoint = Math.ceil(minimum / FONT_STEP_PT);
  const maximumQuarterPoint = Math.max(minimumQuarterPoint, Math.floor(maximum / FONT_STEP_PT));
  const withFont = (quarterPoints: number): SongPage => ({
    ...page,
    fontSize: pointSize(quarterPoints),
  });

  throwIfAborted(signal);
  const maximumPage = withFont(maximumQuarterPoint);
  if (songFits(pageElement, content, maximumPage)) {
    return { ...maximumPage, layoutSafety: "safe" };
  }

  throwIfAborted(signal);
  const minimumPage = withFont(minimumQuarterPoint);
  if (!songFits(pageElement, content, minimumPage)) {
    setSongFont(content, minimumPage.fontSize);
    return { ...minimumPage, layoutSafety: "unsafe" };
  }

  let low = minimumQuarterPoint;
  let high = maximumQuarterPoint;
  let best = minimumQuarterPoint;
  while (low <= high) {
    throwIfAborted(signal);
    const candidate = Math.floor((low + high) / 2);
    const candidatePage = withFont(candidate);
    if (songFits(pageElement, content, candidatePage)) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }

  const resolved = withFont(best);
  setSongFont(content, resolved.fontSize);
  return { ...resolved, layoutSafety: "safe" };
}

/**
 * Resolve every rendered song page at the largest safe 0.25 pt size.
 * The draft is never mutated; the returned plan contains the measured sizes.
 */
export async function resolveRenderedDraft(
  root: HTMLElement,
  draft: PrintPlan,
  signal?: AbortSignal,
): Promise<PrintPlan> {
  await waitForStableLayout(root, signal);
  let resolved = clonePlan(draft);
  resolved = withMeasuredToc(root, resolved);
  const pageElements = renderedPages(root);

  resolved.pages = resolved.pages.map((page) => {
    if (page.kind !== "song") return page;
    throwIfAborted(signal);
    const pageElement = pageElements.get(page.id);
    const content = renderedSongContent(root, page.id);
    if (!pageElement || !content) return { ...page, layoutSafety: "unsafe" };
    return resolveSongPage(pageElement, content, page, signal);
  });

  return resolved;
}

/** Audit all rendered page regions, including TOC pages, without mutating the plan. */
export async function auditRenderedPlan(
  root: HTMLElement,
  plan: PrintPlan,
  signal?: AbortSignal,
): Promise<PrintSafetyReport> {
  await waitForStableLayout(root, signal);
  return inspectPlan(root, plan);
}
