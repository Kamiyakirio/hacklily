// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import DOMPurify from "dompurify";
import { ZoomIn, ZoomOut } from "lucide-react";
import type * as monacoEditor from "monaco-editor";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { track } from "#/lib/analytics";
import { decodeArrayBuffer } from "#/lib/base64Binary";
import { renderVersionFor } from "#/lib/lilypondVersion";
import type { RenderResult, SvgRenderer } from "#/lib/SvgRenderer";
import { cn } from "#/lib/utils";

import type { ViewMode } from "./Header";
import { MODE_BOTH, MODE_VIEW } from "./Header";
import Logs from "./Logs";
import { APP_STYLE } from "./styles";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";

// ─────────────────────────────────────────────────────────────
// DOMPurify hooks
// ─────────────────────────────────────────────────────────────

// Restrict <use> href/xlink:href to internal #fragment identifiers only.
// External URIs (https:, data:, javascript:) are blocked at the attribute
// level so the <use> element itself (allowed via ADD_TAGS in sanitize()) is
// preserved but rendered inert. The hook is idempotent — if HMR registers
// it twice, both invocations set keepAttr = false (or not), always the same.
DOMPurify.addHook(
  "uponSanitizeAttribute",
  function hacklily_use_fragment_only(node, hookEvent) {
    if (
      node.nodeName?.toLowerCase() === "use" &&
      (hookEvent.attrName === "href" || hookEvent.attrName === "xlink:href")
    ) {
      if (!hookEvent.attrValue.startsWith("#")) {
        hookEvent.keepAttr = false;
      }
    }
  },
);

/**
 * Pattern: a CSS-function `url(#…)` reference to a same-document fragment.
 * Captures the fragment identifier so it can be prefixed.
 */
const URL_FRAGMENT_RE = /url\(\s*#([^)\s]+)\s*\)/g;

/**
 * Sanitize SVG/HTML and prefix every `id` and fragment reference with
 * a caller-chosen string, isolating this batch of markup from others
 * rendered into the same document.
 *
 * The hook:
 *  - Prefixes `id` attribute values so glyphs, clips, gradients etc.
 *    don't collide across score previews.
 *  - Prefixes fragment references in `<use href/xlink:href="#…">` so
 *    glyph lookups still resolve after the rename.
 *  - Prefixes fragments inside `url(#…)` in styling attributes
 *    (`clip-path`, `fill`, `mask`, `style`, etc.) so CSS and
 *    presentation-attribute references stay correct.
 */
export function sanitizeSvg(dirty: string, idPrefix: string): string {
  const hook = function prefixIds(
    node: Element,
    hookEvent: Record<string, any>,
  ) {
    // Skip attributes already stripped by an earlier hook.
    if (hookEvent.keepAttr === false) {
      return;
    }

    const lcName = hookEvent.attrName;
    let value = hookEvent.attrValue;
    let changed = false;

    if (lcName === "id") {
      // Prefix every id — the hook fires once per attribute, so each id
      // gets visited exactly once.
      if (typeof value === "string" && !value.startsWith(idPrefix)) {
        value = idPrefix + value;
        changed = true;
      }
    } else if (
      (lcName === "href" || lcName === "xlink:href") &&
      node.nodeName?.toLowerCase() === "use"
    ) {
      // Prefix #fragment references on <use> so they still point to the
      // renamed glyph/g id.
      if (typeof value === "string" && value.startsWith("#")) {
        value = "#" + idPrefix + value.slice(1);
        changed = true;
      }
    } else if (typeof value === "string") {
      // Prefix fragments inside url(#…) — covers clip-path, fill, mask,
      // filter, marker-*, and inline style.
      const replaced = value.replace(
        URL_FRAGMENT_RE,
        (_match: string, fragment: string) => `url(#${idPrefix}${fragment})`,
      );
      if (replaced !== value) {
        value = replaced;
        changed = true;
      }
    }

    if (changed) {
      hookEvent.attrValue = value;
    }
  };

  DOMPurify.addHook("uponSanitizeAttribute", hook);
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOW_UNKNOWN_PROTOCOLS: true,
      ADD_TAGS: ["use"],
      ADD_ATTR: ["pointer-events"],
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", hook);
  }
}

/**
 * How long the code must not be edited for a preview to render.
 */
const DEBOUNCE_REFERSH_TIMEOUT = 500;
const MIN_ZOOM = 25;
const MAX_ZOOM = 400;
const ZOOM_STEP = 25;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * HTML with a #root element under which the svgs will be inserted.
 *
 * Note: Chrome doesn't render font-face in inline CSS.
 */
const BODY_IFRAME_TEMPLATE = `
<link rel="stylesheet" type="text/css" href="/preview.css">
<div id="root"></div>
`;

interface Props {
  /**
   * The source to render.
   *
   * When this changes, the preview will update (but maybe not right away -- see
   * DEBOUNCE_REFRESH_TIMEOUT).
   */
  code: string;

  /**
   * The logs to render in the Logs button.
   *
   * Although the logs are generated here, it's not stored here to -- that way the parent
   * stays the single source of truth for the logs.
   */
  logs: string | null;

  /**
   * Whether the preview is full-page, half-page, or hidden.
   */
  mode: ViewMode;

  /**
   * Renderer used to engrave the source to SVG with the local desktop engine.
   */
  renderer: SvgRenderer;

  /**
   * Called whenever a preview is rendered. The parent should in turn re-render,
   * settings the logs prop on this component and <Editor />.
   */
  onLogsObtained(logs: string | null, version: "stable" | "unstable"): void;

  onMidiObtained(midi: ArrayBuffer | null): void;

  /**
   * Called whenever a note is clicked. The parent should let the <Editor /> know
   * so it can focus where the note is defined.
   */
  onSelectionChanged(selection: monacoEditor.ISelection | null): void;
}

/**
 * Makes the logs easier to read by hiding details not relevant to the user.
 */
function cleanLogs(logs: string): string {
  return (
    logs
      // Move wrapper errors to the start of the page.
      .replace(
        /\/tmp\/lyp\/wrappers\/hacklily.ly:([0-9]*):([0-9]*)/g,
        "/tmp/hacklily.ly:$1:$2",
      )
      // Hide confusing reference to lyp
      .replace(/`\/tmp\/lyp\/wrappers\/hacklily.ly'/g, "`hacklily-wrapper.ly'")
      .replace(/^Lyp.*\n/gm, "")
      .replace(/^GNU LilyPond Server.*[\n\s]*/gm, "")
      // Remove prompt
      .replace(/^>\s*\n?/gm, "")
  );
}

/**
 * Renders an SVG preview of the song in an iframe.
 *
 * The SVG is retrieved from the local LilyPond engine via the SvgRenderer.
 *
 * On update, it sends back the logs to the parent so that it can be used to highlight
 * errors in the editor. See onLogsObtained.
 *
 * When you click a note, it fires onSelectionChanged so that the editor can highlight
 * where the note is defined.
 */
export default function Preview(props: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [zoom, setZoom] = useState(100);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const previousMIDIData = useRef<string | null>(null);
  const schedule = useRef<((code: string) => void) | null>(null);
  const selectionChanged = useEffectEvent(
    (selection: monacoEditor.ISelection) => props.onSelectionChanged(selection),
  );
  const applyResult = useEffectEvent(
    (result: RenderResult, version: "stable" | "unstable") => {
      const files: string[] = result.files;
      const dirtyLogs = result.logs;
      const midi = result.midi || null;
      const warnings = result.warnings ?? 0;
      const errors = result.errors ?? 0;

      const logs: string = cleanLogs(dirtyLogs);

      if (!frameRef.current) {
        throw new Error("Could not get frame's window");
      }

      if (!frameRef.current.contentWindow) {
        throw new Error("Could not get frame's window");
      }

      const root =
        frameRef.current.contentWindow.document.getElementById("root");

      if (!root) {
        throw new Error("Could not get sheet music view root!");
      }

      // A successful compile yields at least one non-empty SVG page; an empty
      // result means LilyPond produced logs but no output (e.g. a syntax
      // error), which we treat as an error state below and must not count as a
      // render.
      const hasOutput = files.length > 0 && files[0].trim() !== "";

      // If we've gotten into an error state, keep the existing height
      // so that we don't rescroll on update.
      root.style.minHeight = hasOutput ? "0" : `${root.scrollHeight}px`;

      // dompurify v3 preserves the <style>{ tspan { white-space: pre; } }</style>
      // block LilyPond 2.26+ emits (the CDATA wrapper is dropped, but the CSS
      // rule survives and still applies), so multi-space text/lyrics keep their
      // spacing. ALLOW_UNKNOWN_PROTOCOLS keeps LilyPond's textedit: links.
      // ADD_TAGS admits <use> so LilyPond glyph references survive, and
      // ADD_ATTR passes pointer-events through for interaction. A module-level
      // uponSanitizeAttribute hook strips non-fragment href/xlink:href on use.
      // A per-call hook prefixes every id and fragment reference so multiple
      // score previews in the same document don't collide, and pages within a
      // multi-page score don't clobber each other's glyph/clip/gradient IDs.
      // See src/Preview.sanitize.test.ts for regression coverage.
      root.innerHTML = files
        .map((page, i) =>
          sanitizeSvg(
            page,
            `p${crypto.randomUUID().replace(/-/g, "")}-pg${i}-`,
          ),
        )
        .join("");

      if (hasOutput) {
        track(`render/${version}`);
      }
      if (hasOutput && (warnings > 0 || errors > 0)) {
        // success-with-warnings / success-with-errors: the score engraved,
        // but LilyPond emitted diagnostics. Surface a one-line summary at the
        // top of the logs so the caller can see it wasn't a clean render.
        const parts: string[] = [];
        if (warnings > 0) parts.push(`${warnings} warning(s)`);
        if (errors > 0) parts.push(`${errors} error(s)`);
        props.onLogsObtained(
          `[rendered with ${parts.join(", ")}]\n${logs}`,
          version,
        );
      } else {
        props.onLogsObtained(logs, version);
      }
      if (midi !== previousMIDIData.current) {
        if (midi) {
          props.onMidiObtained(decodeArrayBuffer(midi.replace(/\s/g, "")));
        } else {
          props.onMidiObtained(null);
        }
      }
      previousMIDIData.current = midi;

      const svgs: SVGSVGElement[] = Array.from(
        root.getElementsByTagName("svg"),
      );
      for (const svg of svgs) {
        const viewBox = svg
          .getAttribute("viewBox")
          ?.trim()
          .split(/[\s,]+/)
          .map(Number);
        if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
          svg.style.setProperty(
            "--page-aspect",
            String(viewBox[2] / viewBox[3]),
          );
        }
        svg.removeAttribute("width");
        svg.removeAttribute("height");
      }

      setError(null);
    },
  );
  const reportError = useEffectEvent(
    (cause: unknown, version: "stable" | "unstable") => {
      const message =
        cause instanceof Error
          ? cause.message
          : typeof cause === "object" &&
              cause &&
              "error" in cause &&
              typeof cause.error === "object" &&
              cause.error &&
              "message" in cause.error &&
              typeof cause.error.message === "string"
            ? cause.error.message
            : "unknown error";
      props.onLogsObtained(message, version);
      setError(message);
    },
  );

  useLayoutEffect(() => {
    frameDocument
      ?.getElementById("root")
      ?.style.setProperty("--preview-scale", String(zoom / 100));
  }, [frameDocument, zoom]);

  useEffect(() => {
    if (!frameDocument) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? frameDocument.defaultView?.innerHeight ||
              frameDocument.documentElement.clientHeight
            : 1);
      setZoom((previous) => clampZoom(previous * Math.exp(-delta * 0.002)));
    };
    frameDocument.addEventListener("wheel", wheel, { passive: false });
    return () => frameDocument.removeEventListener("wheel", wheel);
  }, [frameDocument]);

  useEffect(() => {
    const body = frameDocument?.body;
    if (!body) return;
    const documentElement = frameDocument.documentElement;
    let drag: {
      pointerId: number;
      x: number;
      y: number;
      left: number;
      top: number;
      button: number;
      target: Element;
      moved: boolean;
    } | null = null;
    let suppressClick = false;
    let clickReset: ReturnType<typeof setTimeout> | undefined;

    const finishDrag = (event?: PointerEvent) => {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      const current = drag;
      drag = null;
      documentElement.classList.remove("isPanning");
      try {
        if (current.target.hasPointerCapture?.(current.pointerId)) {
          current.target.releasePointerCapture(current.pointerId);
        }
      } catch {
        /* The SVG can be replaced while a pointer is captured. */
      }
      if (current.moved) {
        suppressClick = true;
        clearTimeout(clickReset);
        clickReset = setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };
    const pointerDown = (event: PointerEvent) => {
      if (
        drag ||
        event.pointerType === "touch" ||
        (event.button !== 0 && event.button !== 1)
      )
        return;
      const scroll = frameDocument.scrollingElement || documentElement;
      const target = event.target as Element;
      clearTimeout(clickReset);
      suppressClick = false;
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: scroll.scrollLeft,
        top: scroll.scrollTop,
        button: event.button === 0 ? 1 : 4,
        target,
        moved: false,
      };
      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        /* Synthetic pointers and detached SVG targets cannot capture. */
      }
      if (event.button === 1) event.preventDefault();
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!(event.buttons & drag.button)) {
        finishDrag(event);
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      suppressClick = true;
      documentElement.classList.add("isPanning");
      event.preventDefault();
      const scroll = frameDocument.scrollingElement || documentElement;
      scroll.scrollLeft = drag.left - dx;
      scroll.scrollTop = drag.top - dy;
    };
    const preventNativeDrag = (event: DragEvent) => event.preventDefault();
    const blur = () => finishDrag();
    const click = (ev: MouseEvent) => {
      ev.preventDefault();
      if (suppressClick) {
        suppressClick = false;
        ev.stopPropagation();
        return;
      }
      let target: HTMLElement | null = ev.target as HTMLElement | null;
      while (target && target.localName !== "a") {
        target = target.parentElement;
      }
      if (target && target.localName === "a") {
        const link: string | null =
          target.getAttribute("xlink:href") || target.getAttribute("href");
        if (!link?.startsWith("textedit:")) {
          return;
        }
        const pathAndLocation: string[] = link.split(".ly:");
        if (pathAndLocation.length === 2) {
          const [line, startColumn, endColumn] = pathAndLocation[1].split(":");
          selectionChanged({
            positionColumn: parseInt(endColumn, 10) + 1,
            positionLineNumber: parseInt(line, 10),
            selectionStartColumn: parseInt(startColumn, 10) + 1,
            selectionStartLineNumber: parseInt(line, 10),
          });
        }
      }
    };
    body.addEventListener("click", click);
    frameDocument.addEventListener("pointerdown", pointerDown);
    frameDocument.addEventListener("pointermove", pointerMove, {
      passive: false,
    });
    frameDocument.addEventListener("pointerup", finishDrag);
    frameDocument.addEventListener("pointercancel", finishDrag);
    frameDocument.addEventListener("lostpointercapture", finishDrag);
    frameDocument.addEventListener("dragstart", preventNativeDrag);
    frameDocument.defaultView?.addEventListener("blur", blur);
    return () => {
      finishDrag();
      clearTimeout(clickReset);
      body.removeEventListener("click", click);
      frameDocument.removeEventListener("pointerdown", pointerDown);
      frameDocument.removeEventListener("pointermove", pointerMove);
      frameDocument.removeEventListener("pointerup", finishDrag);
      frameDocument.removeEventListener("pointercancel", finishDrag);
      frameDocument.removeEventListener("lostpointercapture", finishDrag);
      frameDocument.removeEventListener("dragstart", preventNativeDrag);
      frameDocument.defaultView?.removeEventListener("blur", blur);
    };
  }, [frameDocument]);

  useEffect(() => {
    const body = frameDocument?.body;
    if (!body) return;
    body.classList.toggle("modeBoth", props.mode === MODE_BOTH);
    body.classList.toggle("modeView", props.mode === MODE_VIEW);
    body.classList.toggle(
      "modeEdit",
      props.mode !== MODE_BOTH && props.mode !== MODE_VIEW,
    );
  }, [frameDocument, props.mode]);

  useEffect(() => {
    let active = true;
    let running = false;
    let queued = false;
    let latestCode = "";
    let timer: ReturnType<typeof setTimeout>;
    const renderer = props.renderer;

    async function run() {
      if (!active) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      queued = false;
      setPending(true);
      const code = latestCode;
      const version = renderVersionFor(code);
      try {
        const result = await renderer.renderSvg(code, version);
        if (active && code === latestCode) applyResult(result, version);
      } catch (cause) {
        if (active && code === latestCode) reportError(cause, version);
      } finally {
        running = false;
        if (active) {
          if (queued) {
            clearTimeout(timer);
            timer = setTimeout(() => void run(), DEBOUNCE_REFERSH_TIMEOUT);
          } else setPending(false);
        }
      }
    }
    function request(code: string) {
      latestCode = code;
      queued = true;
      if (running) renderer.cancel?.();
      clearTimeout(timer);
      timer = setTimeout(() => void run(), DEBOUNCE_REFERSH_TIMEOUT);
    }
    schedule.current = request;
    return () => {
      active = false;
      clearTimeout(timer);
      renderer.cancel?.();
      schedule.current = null;
    };
  }, [props.renderer]);

  useEffect(() => {
    schedule.current?.(props.code);
  }, [props.code, props.renderer]);

  const { mode, logs } = props;
  const pendingPreviews = pending ? 1 : 0;
  const previewLeft = mode === MODE_BOTH ? "var(--editor-width, 50%)" : 0;

  // WARNING: The iframe is NOT sandboxed so we can write to the iframe and so
  // that we can add a click event (see onSelectionChanged).

  return (
    <div className="bg-background border-l border-black">
      <iframe
        title="Score preview"
        srcDoc={BODY_IFRAME_TEMPLATE}
        onLoad={(event) =>
          setFrameDocument(event.currentTarget.contentDocument)
        }
        className={cn(APP_STYLE.sheetMusicView)}
        height="100%"
        ref={frameRef}
        style={{
          width:
            mode === MODE_BOTH
              ? "calc(100% - var(--editor-width, 50%))"
              : mode === MODE_VIEW
                ? "100%"
                : 0,
        }}
      />
      {mode !== "edit" && (
        <ButtonGroup
          aria-label="Preview zoom"
          className="absolute right-3 top-3 z-10 rounded-lg bg-background shadow-md"
          title="Ctrl/⌘ + mouse wheel to zoom"
        >
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() =>
              setZoom((previous) => clampZoom(previous - ZOOM_STEP))
            }
          >
            <ZoomOut />
          </Button>
          <Button
            variant="outline"
            className="min-w-16 tabular-nums"
            aria-label="Reset zoom"
            title="Reset to 100%"
            onClick={() => setZoom(100)}
          >
            {Math.round(zoom)}%
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() =>
              setZoom((previous) => clampZoom(previous + ZOOM_STEP))
            }
          >
            <ZoomIn />
          </Button>
        </ButtonGroup>
      )}
      {pendingPreviews > 0 && mode !== "edit" && (
        <div
          className={APP_STYLE.pendingPreviewMask}
          style={{ left: previewLeft }}
        />
      )}
      {error && (
        <div
          className={cn(
            "bg-black text-white absolute inset-y-0 right-0 p-4 text-center",
          )}
          style={{
            left: previewLeft,
            display: mode === "edit" ? "none" : undefined,
          }}
        >
          {error}
        </div>
      )}
      <Logs
        logs={logs}
        loading={!logs || logs.length === 0 || pendingPreviews > 0}
      />
    </div>
  );
}
