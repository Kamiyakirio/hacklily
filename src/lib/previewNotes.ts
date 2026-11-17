import type { ISelection } from "monaco-editor";

import { readLilypondNotes } from "./lilypondSource";

export interface SourceRange {
  start: number;
  end: number;
}
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface PreviewNote {
  element: Element;
  range: SourceRange;
  key: string;
  box: Box;
  row: StaffRow;
}
export interface StaffRow extends Box {
  page: number;
  system: number;
  staff: number;
  spacing: number;
}

export function sourcePositions(code: string) {
  const lines = code.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  function position(at: number) {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= at) line++;
    return { lineNumber: line + 1, column: at - starts[line] + 1 };
  }
  return {
    linkOffset(href: string) {
      // The final fields are line, zero-based Unicode character, and display
      // column, not a selection's start/end columns. Native renders use this file.
      const match = /(?:^|\/)hacklily\.ly:(\d+):(\d+):\d+$/.exec(href);
      if (!href.startsWith("textedit:") || !match) return null;
      const line = Number(match[1]) - 1;
      if (line < 0 || line >= lines.length) return null;
      const prefix = Array.from(lines[line])
        .slice(0, Number(match[2]))
        .join("");
      return starts[line] + prefix.length;
    },
    toRange(selection: ISelection): SourceRange {
      const a =
        (starts[selection.selectionStartLineNumber - 1] ?? code.length) +
        selection.selectionStartColumn -
        1;
      const b =
        (starts[selection.positionLineNumber - 1] ?? code.length) +
        selection.positionColumn -
        1;
      return { start: Math.min(a, b), end: Math.max(a, b) };
    },
    toSelection(range: SourceRange): ISelection {
      const start = position(range.start),
        end = position(range.end);
      return {
        selectionStartLineNumber: start.lineNumber,
        selectionStartColumn: start.column,
        positionLineNumber: end.lineNumber,
        positionColumn: end.column,
      };
    },
  };
}

export function noteRanges(code: string, keys: Set<string>): SourceRange[] {
  const { notes, masked } = readLilypondNotes(code);
  const ranges: SourceRange[] = [];
  let active: SourceRange | null = null;
  for (const note of notes) {
    if (!note.pitched) continue;
    if (!keys.has(`${note.start}:${note.end}`)) {
      active = null;
      continue;
    }
    if (active && !/[{}]|<<|>>|\\\\/.test(masked.slice(active.end, note.start)))
      active.end = note.end;
    else {
      active = { start: note.start, end: note.end };
      ranges.push(active);
    }
  }
  return ranges;
}

const centerX = (box: Box) => (box.left + box.right) / 2;
const centerY = (box: Box) => (box.top + box.bottom) / 2;
const distanceY = (y: number, box: Box) =>
  Math.max(box.top - y, 0, y - box.bottom);
const rowDistance = (x: number, y: number, row: StaffRow) =>
  Math.hypot(distanceY(y, row), Math.max(row.left - x, 0, x - row.right));

export function measurePreview(root: HTMLElement, code: string): PreviewNote[] {
  const doc = root.ownerDocument;
  const scroll = doc.scrollingElement || doc.documentElement;
  const boxOf = (element: Element): Box => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left + scroll.scrollLeft,
      right: box.right + scroll.scrollLeft,
      top: box.top + scroll.scrollTop,
      bottom: box.bottom + scroll.scrollTop,
    };
  };
  const { notes } = readLilypondNotes(code);
  const positions = sourcePositions(code);
  const entries: PreviewNote[] = [];
  const rows: StaffRow[] = [];
  Array.from(root.querySelectorAll("svg")).forEach((svg, page) => {
    const pageBox = boxOf(svg);
    const lines = Array.from(svg.querySelectorAll("line"))
      .map(boxOf)
      .filter(
        (box) =>
          box.right - box.left > (pageBox.right - pageBox.left) / 4 &&
          box.bottom - box.top < 1,
      )
      .sort((a, b) => a.top - b.top);
    const pageRows: StaffRow[] = [];
    for (let i = 0; i + 4 < lines.length; i++) {
      const five = lines.slice(i, i + 5);
      const spacing = five[1].top - five[0].top;
      if (
        spacing <= 0 ||
        !five.every(
          (line, j) =>
            Math.abs(line.top - five[0].top - j * spacing) < spacing / 4 &&
            Math.abs(line.left - five[0].left) < 2 &&
            Math.abs(line.right - five[0].right) < 2,
        )
      )
        continue;
      pageRows.push({
        ...five[0],
        bottom: five[4].top,
        spacing,
        page,
        system: -1,
        staff: 0,
      });
      i += 4;
    }
    if (!pageRows.length)
      pageRows.push({ ...pageBox, page, spacing: 4, system: -1, staff: 0 });
    // The system-start bar connects the staves that must share one time axis.
    const parents = pageRows.map((_, i) => i);
    const find = (i: number): number =>
      parents[i] === i ? i : find(parents[i]);
    for (const rect of Array.from(svg.querySelectorAll("rect"))) {
      if (rect.closest("a")) continue;
      const box = boxOf(rect);
      const connected = pageRows
        .map((row, i) => ({ row, i }))
        .filter(
          ({ row }) =>
            box.right - box.left <= row.spacing &&
            box.bottom - box.top > row.bottom - row.top + row.spacing &&
            Math.abs(box.left - row.left) < row.spacing * 2 &&
            box.top <= centerY(row) &&
            box.bottom >= centerY(row),
        );
      for (const item of connected.slice(1))
        parents[find(item.i)] = find(connected[0].i);
    }
    const systems = [...new Set(pageRows.map((_, i) => find(i)))];
    for (const system of systems) {
      const members = pageRows.filter((_, i) => find(i) === system);
      members.forEach((row, staff) => {
        row.system = rows.length + systems.indexOf(system);
        row.staff = staff;
      });
    }
    // Native SVG stems are translated from the staff's middle line. Use that
    // baseline for ledger-line notes that sit closer to a neighboring staff.
    const stems = Array.from(svg.querySelectorAll("rect")).flatMap((rect) => {
      const width = Number(rect.getAttribute("width")),
        x = Number(rect.getAttribute("x"));
      if (
        rect.closest("a") ||
        width <= 0 ||
        Math.abs(x + width / 2) > width / 10
      )
        return [];
      const matrix = rect.getScreenCTM?.();
      if (!matrix) return [];
      const y = matrix.f + scroll.scrollTop;
      const row = pageRows.reduce((a, b) =>
        Math.abs(centerY(a) - y) < Math.abs(centerY(b) - y) ? a : b,
      );
      return Math.abs(centerY(row) - y) < row.spacing / 2
        ? [{ box: boxOf(rect), x: matrix.e + scroll.scrollLeft, row }]
        : [];
    });
    for (const element of Array.from(svg.querySelectorAll("a"))) {
      const href =
        element.getAttribute("xlink:href") ||
        element.getAttribute("href") ||
        "";
      const offset = positions.linkOffset(href);
      if (offset === null) continue;
      const note = notes.find(
        (item) => item.pitched && item.start <= offset && offset < item.end,
      );
      if (!note) continue;
      element.setAttribute("data-preview-note", `${note.start}:${note.end}`);
      element.setAttribute(
        "aria-label",
        `Select note ${code.slice(note.start, note.end)}`,
      );
      const box = boxOf(element);
      const nearestRow = pageRows.reduce((a, b) =>
        Math.abs(centerY(a) - centerY(box)) <=
        Math.abs(centerY(b) - centerY(box))
          ? a
          : b,
      );
      const attached = stems.filter(
        (stem) =>
          Math.min(Math.abs(stem.x - box.left), Math.abs(stem.x - box.right)) <
            stem.row.spacing / 2 &&
          stem.box.top <= box.bottom &&
          stem.box.bottom >= box.top,
      );
      const score = (stem: (typeof stems)[number]) =>
        Math.min(Math.abs(stem.x - box.left), Math.abs(stem.x - box.right)) +
        Math.min(
          Math.abs(stem.box.top - centerY(box)),
          Math.abs(stem.box.bottom - centerY(box)),
        );
      const row = attached.length
        ? attached.reduce((a, b) => (score(a) < score(b) ? a : b)).row
        : nearestRow;
      entries.push({
        element,
        range: { start: note.start, end: note.end },
        key: `${note.start}:${note.end}`,
        box,
        row,
      });
    }
    rows.push(...pageRows);
  });
  return entries;
}

export function nearestPreviewNote(
  notes: PreviewNote[],
  x: number,
  y: number,
): PreviewNote | null {
  if (!notes.length) return null;
  const hit = notes.find(
    (note) =>
      x >= note.box.left - 2 &&
      x <= note.box.right + 2 &&
      y >= note.box.top - 2 &&
      y <= note.box.bottom + 2,
  );
  if (hit) return hit;
  const row = notes.reduce((a, b) =>
    rowDistance(x, y, a.row) < rowDistance(x, y, b.row) ||
    (rowDistance(x, y, a.row) === rowDistance(x, y, b.row) &&
      Math.abs(centerY(a.row) - y) < Math.abs(centerY(b.row) - y))
      ? a
      : b,
  ).row;
  return notes
    .filter((note) => note.row === row)
    .reduce((a, b) =>
      Math.abs(centerX(a.box) - x) <= Math.abs(centerX(b.box) - x) ? a : b,
    );
}

export function previewRange(
  notes: PreviewNote[],
  anchor: PreviewNote,
  end: PreviewNote,
): Set<string> {
  const earlier =
    anchor.row.system < end.row.system ||
    (anchor.row.system === end.row.system &&
      centerX(anchor.box) <= centerX(end.box));
  const first = earlier ? anchor : end,
    last = earlier ? end : anchor;
  const lowStaff = Math.min(anchor.row.staff, end.row.staff),
    highStaff = Math.max(anchor.row.staff, end.row.staff);
  const tolerance = Math.max(
    1,
    Math.min(anchor.box.right - anchor.box.left, end.box.right - end.box.left) /
      2,
  );
  return new Set(
    notes
      .filter(
        (note) =>
          note.row.staff >= lowStaff &&
          note.row.staff <= highStaff &&
          note.row.system >= first.row.system &&
          note.row.system <= last.row.system &&
          (note.row.system !== first.row.system ||
            centerX(note.box) >= centerX(first.box) - tolerance) &&
          (note.row.system !== last.row.system ||
            centerX(note.box) <= centerX(last.box) + tolerance),
      )
      .map((note) => note.key),
  );
}
