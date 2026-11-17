import { readLilypondNotes } from "./lilypondSource";
import { attachPreviewInteraction } from "./previewInteraction";
import {
  measurePreview,
  nearestPreviewNote,
  noteRanges,
  previewRange,
  sourcePositions,
} from "./previewNotes";

const CODE = `upper = \\relative c' {
 c4 d e f
 g4 a b c
 d4 e f g
}
lower = \\relative c {
 c4 e g c
 d4 f a d
 e4 g b e
}`;

function box(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function fixture(horizontalPages = false) {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.body.innerHTML = '<div id="root"></div>';
  const root = doc.getElementById("root");
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(box(0, 0, 600, 1200));
  const sourceNotes = readLilypondNotes(CODE).notes.filter(
    (note) => note.pitched,
  );
  const elements: Element[] = [];
  const positions = sourcePositions(CODE);
  const pages = horizontalPages ? 2 : 1;
  for (let page = 0; page < pages; page++) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    root.appendChild(svg);
    const pageX = page * 620;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
      box(pageX, 0, 600, 800),
    );
    const systems = horizontalPages ? (page === 0 ? [0, 1] : [2]) : [0, 1, 2];
    for (const system of systems) {
      const y = horizontalPages && page === 1 ? 100 : 100 + system * 220;
      const startBar = doc.createElementNS(svg.namespaceURI, "rect");
      svg.appendChild(startBar);
      vi.spyOn(startBar, "getBoundingClientRect").mockReturnValue(
        box(pageX + 39.5, y, 1, 76),
      );
      for (let staff = 0; staff < 2; staff++) {
        for (let line = 0; line < 5; line++) {
          const element = doc.createElementNS(svg.namespaceURI, "line");
          svg.appendChild(element);
          vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
            box(pageX + 40, y + staff * 60 + line * 4, 500, 0),
          );
        }
        for (let column = 0; column < 4; column++) {
          const index = staff * 12 + system * 4 + column;
          const note = sourceNotes[index],
            selection = positions.toSelection(note);
          const element = doc.createElementNS(svg.namespaceURI, "a");
          element.setAttribute(
            "href",
            `textedit:///tmp/hacklily.ly:${selection.selectionStartLineNumber}:${selection.selectionStartColumn - 1}:99`,
          );
          element.innerHTML = '<path d="M0 0"/>';
          svg.appendChild(element);
          elements[index] = element;
          vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
            box(pageX + 80 + column * 120, y + staff * 60 + 5, 10, 6),
          );
        }
      }
    }
  }
  const entries = () => measurePreview(root, CODE);
  const key = (index: number) =>
    `${sourceNotes[index].start}:${sourceNotes[index].end}`;
  return { frame, doc, root, elements, entries, key, sourceNotes };
}

function pointer(
  doc: Document,
  target: Element | Document,
  type: string,
  x: number,
  y: number,
  buttons = 1,
) {
  const event = new doc.defaultView.MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  target.dispatchEvent(event);
}

afterEach(() => {
  document.querySelectorAll("iframe").forEach((frame) => frame.remove());
  vi.restoreAllMocks();
});

describe("preview source and staff geometry", () => {
  it("interprets Unicode source characters independently of display columns", () => {
    const code = "\\relative c' {\n\t%{ 中文😀 %} c4 d4\n}";
    const positions = sourcePositions(code);
    const offset = positions.linkOffset("textedit:///tmp/hacklily.ly:2:11:19");
    expect(code.slice(offset, offset + 2)).toBe("c4");
    expect(positions.toSelection({ start: offset, end: offset + 2 })).toEqual({
      selectionStartLineNumber: 2,
      selectionStartColumn: 13,
      positionLineNumber: 2,
      positionColumn: 15,
    });
    expect(
      positions.linkOffset("textedit:///tmp/library.ily:2:11:19"),
    ).toBeNull();
  });

  it("recognizes three systems with two staves each", () => {
    const f = fixture(),
      notes = f.entries();
    expect(notes).toHaveLength(24);
    expect(notes.find((note) => note.key === f.key(0)).row).toMatchObject({
      system: 0,
      staff: 0,
    });
    expect(notes.find((note) => note.key === f.key(12)).row).toMatchObject({
      system: 0,
      staff: 1,
    });
    expect(notes.find((note) => note.key === f.key(8)).row).toMatchObject({
      system: 2,
      staff: 0,
    });
  });

  it("keeps ledger-line notes on the staff identified by their stem baseline", () => {
    const f = fixture();
    vi.mocked(f.elements[12].getBoundingClientRect).mockReturnValue(
      box(80, 115, 10, 6),
    );
    const stem = f.doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    stem.setAttribute("x", "-0.065");
    stem.setAttribute("width", "0.13");
    f.root.querySelector("svg").appendChild(stem);
    vi.spyOn(stem, "getBoundingClientRect").mockReturnValue(
      box(80.5, 117, 1, 25),
    );
    Object.defineProperty(stem, "getScreenCTM", {
      value: () => ({ e: 80.5, f: 168 }),
    });
    expect(f.entries().find((note) => note.key === f.key(12)).row.staff).toBe(
      1,
    );
  });

  it("wraps from the right of the first system through intermediate systems to the left of the last", () => {
    const f = fixture(),
      notes = f.entries();
    const first = notes.find((note) => note.key === f.key(2)),
      last = notes.find((note) => note.key === f.key(9));
    const expected = new Set([2, 3, 4, 5, 6, 7, 8, 9].map(f.key));
    expect(previewRange(notes, first, last)).toEqual(expected);
    expect(previewRange(notes, last, first)).toEqual(expected);
    const ranges = noteRanges(CODE, expected);
    expect(ranges).toHaveLength(1);
    expect(CODE.slice(ranges[0].start, ranges[0].end)).toBe(
      "e f\n g4 a b c\n d4 e",
    );
  });

  it("keeps separate source selections when a range covers both staves", () => {
    const f = fixture(),
      notes = f.entries();
    const first = notes.find((note) => note.key === f.key(2)),
      last = notes.find((note) => note.key === f.key(17));
    const selected = previewRange(notes, first, last);
    expect(selected).toEqual(new Set([2, 3, 4, 5, 14, 15, 16, 17].map(f.key)));
    expect(noteRanges(CODE, selected)).toHaveLength(2);
  });

  it("selects across pages laid out horizontally", () => {
    const f = fixture(true),
      notes = f.entries();
    const first = notes.find((note) => note.key === f.key(6)),
      last = notes.find((note) => note.key === f.key(9));
    expect(previewRange(notes, first, last)).toEqual(
      new Set([6, 7, 8, 9].map(f.key)),
    );
    expect(nearestPreviewNote(notes, 660, 108).row.system).toBe(
      last.row.system,
    );
  });
});

describe("preview selection interaction", () => {
  it("accepts clicks on the highlight around a note head", () => {
    const f = fixture(),
      onSelect = vi.fn();
    const controller = attachPreviewInteraction(f.doc, {
      source: () => CODE,
      onSelect,
    });
    f.doc.body.dispatchEvent(
      new MouseEvent("click", {
        clientX: 79,
        clientY: 108,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onSelect.mock.lastCall[0]).toHaveLength(1);
    expect(f.elements[0].hasAttribute("data-preview-selected")).toBe(true);
    controller.destroy();
  });
  it("scrolls at the iframe viewport edge while dragging across systems", () => {
    const f = fixture(),
      onSelect = vi.fn();
    Object.defineProperty(f.doc.defaultView, "innerHeight", {
      value: 300,
      configurable: true,
    });
    const scroll = f.doc.scrollingElement || f.doc.documentElement;
    let top = 0;
    Object.defineProperty(scroll, "scrollTop", {
      get: () => top,
      set: (value) => {
        top = Math.min(600, Math.max(0, value));
      },
      configurable: true,
    });
    let scheduled: FrameRequestCallback;
    vi.spyOn(f.doc.defaultView, "requestAnimationFrame").mockImplementation(
      (callback) => {
        scheduled = callback;
        return 1;
      },
    );
    const cancel = vi.spyOn(f.doc.defaultView, "cancelAnimationFrame");
    const controller = attachPreviewInteraction(f.doc, {
      source: () => CODE,
      onSelect,
    });
    controller.setTool("select");
    pointer(f.doc, f.elements[0], "pointerdown", 85, 108);
    pointer(f.doc, f.doc, "pointermove", 205, 296);
    expect(top).toBeGreaterThan(0);
    const first = top;
    scheduled(0);
    expect(top).toBeGreaterThan(first);
    pointer(f.doc, f.doc, "pointerup", 205, 296, 0);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalled();
    controller.destroy();
  });

  it("does not select stale score links after the source has changed", () => {
    const f = fixture(),
      onSelect = vi.fn();
    let code: string | null = CODE;
    const controller = attachPreviewInteraction(f.doc, {
      source: () => code,
      onSelect,
    });
    f.elements[0].dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(1);
    onSelect.mockClear();
    code = null;
    controller.setSelections([]);
    f.elements[0].dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(0);
    controller.destroy();
  });

  it("keeps left-drag panning as the default and does not select while panning", () => {
    const f = fixture(),
      onSelect = vi.fn();
    const controller = attachPreviewInteraction(f.doc, {
      source: () => CODE,
      onSelect,
    });
    controller.setTool("pan");
    pointer(f.doc, f.elements[0], "pointerdown", 85, 108);
    pointer(f.doc, f.doc, "pointermove", 45, 68);
    expect(f.doc.documentElement.classList.contains("isPanning")).toBe(true);
    pointer(f.doc, f.doc, "pointerup", 45, 68, 0);
    expect(onSelect).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("highlights click selections and supports adding and clearing notes", () => {
    const f = fixture(),
      onSelect = vi.fn();
    const controller = attachPreviewInteraction(f.doc, {
      source: () => CODE,
      onSelect,
    });
    f.elements[0].dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(1);
    expect(f.root.querySelectorAll(".score-note-highlight")).toHaveLength(1);
    f.elements[14].dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }),
    );
    expect(onSelect.mock.lastCall[0]).toHaveLength(2);
    f.doc.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(onSelect).toHaveBeenLastCalledWith([]);
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(0);
    controller.destroy();
  });

  it("previews a multi-line drag and commits source selections only after release", () => {
    const f = fixture(),
      onSelect = vi.fn();
    const controller = attachPreviewInteraction(f.doc, {
      source: () => CODE,
      onSelect,
    });
    controller.setTool("select");
    pointer(f.doc, f.elements[2], "pointerdown", 325, 108);
    pointer(f.doc, f.doc, "pointermove", 205, 548);
    expect(onSelect).not.toHaveBeenCalled();
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(8);
    pointer(f.doc, f.doc, "pointerup", 205, 548, 0);
    expect(onSelect.mock.lastCall[0]).toHaveLength(1);
    const range = sourcePositions(CODE).toRange(onSelect.mock.lastCall[0][0]);
    expect(CODE.slice(range.start, range.end)).toBe("e f\n g4 a b c\n d4 e");
    controller.destroy();
  });

  it("restores the original highlight on cancellation and mirrors editor selections", () => {
    const f = fixture(),
      onSelect = vi.fn();
    const controller = attachPreviewInteraction(f.doc, {
      source: () => CODE,
      onSelect,
    });
    controller.setSelections([
      sourcePositions(CODE).toSelection(f.sourceNotes[0]),
    ]);
    controller.setTool("select");
    pointer(f.doc, f.elements[2], "pointerdown", 325, 108);
    pointer(f.doc, f.doc, "pointermove", 205, 548);
    pointer(f.doc, f.doc, "pointercancel", 205, 548, 0);
    expect(onSelect).not.toHaveBeenCalled();
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(1);
    controller.setSelections([
      sourcePositions(CODE).toSelection({
        start: f.sourceNotes[0].start,
        end: f.sourceNotes[0].start,
      }),
    ]);
    expect(f.root.querySelectorAll("[data-preview-selected]")).toHaveLength(0);
    controller.destroy();
    f.elements[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
