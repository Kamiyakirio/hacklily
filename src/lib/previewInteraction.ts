import type { ISelection } from "monaco-editor";

import {
  measurePreview,
  nearestPreviewNote,
  noteRanges,
  previewRange,
  sourcePositions,
} from "./previewNotes";
import type { PreviewNote } from "./previewNotes";

export type PreviewTool = "pan" | "select";

export function attachPreviewInteraction(
  doc: Document,
  options: {
    source(): string | null;
    onSelect(selections: ISelection[]): void;
  },
) {
  const html = doc.documentElement;
  const view = doc.defaultView;
  const scroll = doc.scrollingElement || html;
  let tool: PreviewTool = "pan";
  let notes: PreviewNote[] = [];
  let measuredCode: string | null | undefined;
  let measuredSvg: Element | null = null;
  let selected = new Set<string>();
  let anchor: PreviewNote | null = null;
  let overlay: HTMLDivElement | null = null;
  let suppressClick = false;
  let resetClick: ReturnType<typeof setTimeout>;
  let animation = 0;
  let drag: {
    id: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    left: number;
    top: number;
    pan: boolean;
    button: number;
    target: Element;
    moved: boolean;
    hit: PreviewNote | null;
    anchor: PreviewNote | null;
    before: Set<string>;
    additive: boolean;
  } | null = null;

  function measure(force = false) {
    const root = doc.getElementById("root");
    const code = options.source();
    const svg = root?.querySelector("svg") || null;
    if (!force && code === measuredCode && svg === measuredSvg) return;
    if (code !== measuredCode || svg !== measuredSvg)
      notes.forEach((note) =>
        note.element.removeAttribute("data-preview-selected"),
      );
    measuredCode = code;
    measuredSvg = svg;
    notes = root && code !== null ? measurePreview(root, code) : [];
    if (anchor)
      anchor =
        notes.find(
          (note) =>
            note.key === anchor.key && note.row.system === anchor.row.system,
        ) || null;
  }
  function paint() {
    const root = doc.getElementById("root");
    if (!root) return;
    if (!overlay?.isConnected) {
      overlay = doc.createElement("div");
      overlay.className = "score-selection-overlay";
      overlay.setAttribute("aria-hidden", "true");
      root.appendChild(overlay);
    }
    overlay.replaceChildren();
    const origin = root.getBoundingClientRect();
    const left = origin.left + scroll.scrollLeft,
      top = origin.top + scroll.scrollTop;
    for (const note of notes) {
      const active = selected.has(note.key);
      note.element.toggleAttribute("data-preview-selected", active);
      if (
        !active ||
        note.box.right <= note.box.left ||
        note.box.bottom <= note.box.top
      )
        continue;
      const highlight = doc.createElement("div");
      highlight.className = "score-note-highlight";
      Object.assign(highlight.style, {
        left: `${note.box.left - left - 3}px`,
        top: `${note.box.top - top - 3}px`,
        width: `${note.box.right - note.box.left + 6}px`,
        height: `${note.box.bottom - note.box.top + 6}px`,
      });
      overlay.appendChild(highlight);
    }
  }
  function commit() {
    const code = options.source();
    if (code === null) return;
    const positions = sourcePositions(code);
    options.onSelect(noteRanges(code, selected).map(positions.toSelection));
  }
  function targetNote(event: MouseEvent) {
    const link = (event.target as Element)?.closest?.("a");
    const linked = notes.find((note) => note.element === link);
    if (linked) return linked;
    const x = event.clientX + scroll.scrollLeft,
      y = event.clientY + scroll.scrollTop;
    return (
      notes.find(
        (note) =>
          note.box.right > note.box.left &&
          note.box.bottom > note.box.top &&
          x >= note.box.left - 3 &&
          x <= note.box.right + 3 &&
          y >= note.box.top - 3 &&
          y <= note.box.bottom + 3,
      ) || null
    );
  }
  function choosePoint(note: PreviewNote | null, event: MouseEvent) {
    if (event.shiftKey && note && anchor)
      selected = previewRange(notes, anchor, note);
    else if ((event.metaKey || event.ctrlKey) && note) {
      if (selected.has(note.key)) selected.delete(note.key);
      else selected.add(note.key);
      anchor = note;
    } else {
      selected = new Set(note ? [note.key] : []);
      anchor = note;
    }
    paint();
    commit();
  }
  function updateRange() {
    if (!drag?.anchor) return;
    const end = nearestPreviewNote(
      notes,
      drag.clientX + scroll.scrollLeft,
      drag.clientY + scroll.scrollTop,
    );
    if (!end) return;
    let next = previewRange(notes, drag.anchor, end);
    if (drag.additive) next = new Set([...drag.before, ...next]);
    if (
      selected.size === next.size &&
      [...next].every((key) => selected.has(key))
    )
      return;
    selected = next;
    paint();
  }
  function autoScroll() {
    animation = 0;
    if (!drag || drag.pan || !drag.moved) return;
    const width = view.innerWidth || html.clientWidth,
      height = view.innerHeight || html.clientHeight;
    const edge = (value: number, extent: number) =>
      value < 28
        ? -Math.ceil((28 - value) / 2)
        : value > extent - 28
          ? Math.ceil((value - extent + 28) / 2)
          : 0;
    const x = edge(drag.clientX, width),
      y = edge(drag.clientY, height);
    const oldX = scroll.scrollLeft,
      oldY = scroll.scrollTop;
    scroll.scrollLeft += x;
    scroll.scrollTop += y;
    if (scroll.scrollLeft !== oldX || scroll.scrollTop !== oldY) {
      updateRange();
      animation = view.requestAnimationFrame(autoScroll);
    }
  }
  function finish(event?: PointerEvent, cancel = false) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const current = drag;
    drag = null;
    view.cancelAnimationFrame(animation);
    animation = 0;
    html.classList.remove("isPanning", "isSelectingNotes");
    try {
      if (current.target.hasPointerCapture?.(current.id))
        current.target.releasePointerCapture(current.id);
    } catch {
      /* Rendering can replace a captured SVG. */
    }
    if (cancel && !current.pan) {
      selected = current.before;
      paint();
    }
    if (!cancel && !current.pan && current.moved) {
      anchor = current.anchor;
      commit();
    }
    if (!cancel && !current.moved && event?.button === 0)
      choosePoint(targetNote(event) || current.hit, event);
    suppressClick = true;
    clearTimeout(resetClick);
    resetClick = setTimeout(() => {
      suppressClick = false;
    }, 0);
  }
  function pointerDown(event: PointerEvent) {
    if (
      drag ||
      event.pointerType === "touch" ||
      (event.button !== 0 && event.button !== 1)
    )
      return;
    measure(true);
    const hit = targetNote(event);
    const x = event.clientX + scroll.scrollLeft,
      y = event.clientY + scroll.scrollTop;
    const target = (event.target as Element).setPointerCapture
      ? (event.target as Element)
      : html;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      pan: event.button === 1 || tool === "pan",
      button: event.button === 1 ? 4 : 1,
      target,
      moved: false,
      hit,
      anchor:
        event.shiftKey && anchor
          ? anchor
          : hit || nearestPreviewNote(notes, x, y),
      before: new Set(selected),
      additive: event.ctrlKey || event.metaKey,
    };
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      /* Synthetic pointers do not capture. */
    }
    if (event.button === 1 || !drag.pan) event.preventDefault();
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!(event.buttons & drag.button)) {
      finish(event, true);
      return;
    }
    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    event.preventDefault();
    if (drag.pan) {
      html.classList.add("isPanning");
      scroll.scrollLeft = drag.left - dx;
      scroll.scrollTop = drag.top - dy;
    } else {
      html.classList.add("isSelectingNotes");
      updateRange();
      if (!animation) autoScroll();
    }
  }
  function click(event: MouseEvent) {
    event.preventDefault();
    if (suppressClick) {
      suppressClick = false;
      event.stopPropagation();
      return;
    }
    measure();
    choosePoint(targetNote(event), event);
  }
  const pointerUp = (event: PointerEvent) => finish(event);
  const cancel = (event?: PointerEvent) => finish(event, true);
  const blur = () => cancel();
  const preventNativeDrag = (event: DragEvent) => event.preventDefault();
  const resize = () => {
    if (!drag) {
      measure(true);
      paint();
    }
  };
  doc.addEventListener("pointerdown", pointerDown);
  doc.addEventListener("pointermove", pointerMove, { passive: false });
  doc.addEventListener("pointerup", pointerUp);
  doc.addEventListener("pointercancel", cancel);
  doc.addEventListener("lostpointercapture", cancel);
  doc.addEventListener("dragstart", preventNativeDrag);
  doc.body.addEventListener("click", click);
  view.addEventListener("blur", blur);
  view.addEventListener("resize", resize);

  return {
    setTool(next: PreviewTool) {
      cancel();
      tool = next;
      html.dataset.previewTool = next;
    },
    setSelections(selections: ISelection[]) {
      if (drag && !drag.pan) return;
      measure();
      const code = options.source();
      const ranges =
        code === null ? [] : selections.map(sourcePositions(code).toRange);
      selected = new Set(
        notes
          .filter((note) =>
            ranges.some(
              (range) =>
                range.start < range.end &&
                range.start < note.range.end &&
                range.end > note.range.start,
            ),
          )
          .map((note) => note.key),
      );
      if (!anchor)
        anchor = notes.find((note) => selected.has(note.key)) || null;
      paint();
    },
    refresh() {
      cancel();
      measure(true);
      paint();
    },
    destroy() {
      cancel();
      clearTimeout(resetClick);
      overlay?.remove();
      notes.forEach((note) =>
        note.element.removeAttribute("data-preview-selected"),
      );
      doc.removeEventListener("pointerdown", pointerDown);
      doc.removeEventListener("pointermove", pointerMove);
      doc.removeEventListener("pointerup", pointerUp);
      doc.removeEventListener("pointercancel", cancel);
      doc.removeEventListener("lostpointercapture", cancel);
      doc.removeEventListener("dragstart", preventNativeDrag);
      doc.body.removeEventListener("click", click);
      view.removeEventListener("blur", blur);
      view.removeEventListener("resize", resize);
    },
  };
}
