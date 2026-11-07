import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { RenderResult, SvgRenderer } from "#/lib/SvgRenderer";

import Preview from "./Preview";

type LogsCallback = ComponentProps<typeof Preview>["onLogsObtained"];
type SelectionCallback = ComponentProps<typeof Preview>["onSelectionChanged"];

vi.mock("./Logs", () => ({ default: () => null }));
vi.mock("#/lib/analytics", () => ({ track: vi.fn() }));

function deferred<Result>() {
  let resolve: (value: Result) => void;
  const promise = new Promise<Result>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function result(label: string): RenderResult {
  return {
    files: [
      `<svg xmlns="http://www.w3.org/2000/svg" data-label="${label}"><text>${label}</text></svg>`,
    ],
    logs: label,
  };
}

function pointer(
  type: string,
  x: number,
  y: number,
  options: { button?: number; buttons?: number; pointerType?: string } = {},
) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: options.button ?? 0,
    buttons: options.buttons ?? 1,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
  });
  return event;
}

describe("preview rendering lifetime", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let renders: ReturnType<typeof deferred<RenderResult>>[];
  let renderer: SvgRenderer;
  let onLogsObtained: ReturnType<typeof vi.fn<LogsCallback>>;
  let onSelectionChanged: ReturnType<typeof vi.fn<SelectionCallback>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    renders = [];
    renderer = {
      destroy: vi.fn(),
      renderSvg: vi.fn(() => {
        const request = deferred<RenderResult>();
        renders.push(request);
        return request.promise;
      }),
    };
    onLogsObtained = vi.fn<LogsCallback>();
    onSelectionChanged = vi.fn<SelectionCallback>();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function show(
    code: string,
    logsCallback = onLogsObtained,
    mode: ComponentProps<typeof Preview>["mode"] = "both",
  ) {
    await act(async () =>
      root.render(
        <Preview
          code={code}
          logs=""
          mode={mode}
          renderer={renderer}
          onLogsObtained={logsCallback}
          onMidiObtained={vi.fn()}
          onSelectionChanged={onSelectionChanged}
        />,
      ),
    );
    const frame = container.querySelector("iframe");
    // jsdom does not parse iframe srcDoc; seed the same document as the browser.
    if (!frame.contentDocument.getElementById("root")) {
      frame.contentDocument.body.innerHTML = '<div id="root"></div>';
      await act(async () => frame.dispatchEvent(new Event("load")));
    }
  }

  it("coalesces edits during a render and only publishes the latest score", async () => {
    await show("first");
    await act(async () => vi.advanceTimersByTime(1000));
    await show("second");
    await show("latest");
    await act(async () => vi.advanceTimersByTime(1000));
    expect(renderer.renderSvg).toHaveBeenCalledTimes(1);

    await act(async () => renders[0].resolve(result("first")));
    expect(onLogsObtained).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(renderer.renderSvg).toHaveBeenLastCalledWith("latest", "stable");
    await act(async () => renders[1].resolve(result("latest")));
    expect(onLogsObtained).toHaveBeenCalledWith("latest", "stable");
    expect(
      container
        .querySelector("iframe")
        .contentDocument.querySelector("svg")
        .getAttribute("data-label"),
    ).toBe("latest");
  });

  it("uses updated callbacks without restarting an in-flight request", async () => {
    await show("score");
    await act(async () => vi.advanceTimersByTime(1000));
    const latestCallback = vi.fn<LogsCallback>();
    await show("score", latestCallback);
    await act(async () => renders[0].resolve(result("score")));
    expect(renderer.renderSvg).toHaveBeenCalledTimes(1);
    expect(latestCallback).toHaveBeenCalledWith("score", "stable");
    expect(onLogsObtained).not.toHaveBeenCalled();
  });

  it("ignores responses and cancels queued work after unmounting", async () => {
    await show("first");
    await act(async () => vi.advanceTimersByTime(1000));
    await show("queued");
    await act(async () => root.render(null));
    await act(async () => renders[0].resolve(result("first")));
    await act(async () => vi.advanceTimersByTime(10000));
    expect(onLogsObtained).not.toHaveBeenCalled();
    expect(renderer.renderSvg).toHaveBeenCalledTimes(1);
  });

  it("maps native source links without subtracting the old server's extra line", async () => {
    await show("score");
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () =>
      renders[0].resolve({
        files: [
          '<svg xmlns="http://www.w3.org/2000/svg"><a href="textedit:///tmp/hacklily.ly:1:0:2"><path d="M0 0" /></a></svg>',
        ],
        logs: "",
        midi: null,
      }),
    );
    const frame = container.querySelector("iframe");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')
        .click(),
    );
    expect(
      frame.contentDocument
        .getElementById("root")
        .style.getPropertyValue("--preview-scale"),
    ).toBe("1.25");
    const link = frame.contentDocument.querySelector("path");
    await act(async () =>
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
    expect(onSelectionChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        positionLineNumber: 1,
        selectionStartLineNumber: 1,
      }),
    );
  });

  it("keeps zoom across new pages and view modes without recompiling on zoom", async () => {
    await show("first");
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () => renders[0].resolve(result("first")));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')
        .click(),
    );
    expect(renderer.renderSvg).toHaveBeenCalledTimes(1);
    const reset = () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Reset zoom"]');
    expect(reset().textContent).toBe("125%");
    await show("next");
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () =>
      renders[1].resolve({
        files: ['<svg viewBox="0 0 100 200"/>', '<svg viewBox="0 0 200 100"/>'],
        logs: "next",
      }),
    );
    const scoreRoot = container
      .querySelector("iframe")
      .contentDocument.getElementById("root");
    expect(scoreRoot.querySelectorAll("svg")).toHaveLength(2);
    expect(scoreRoot.style.getPropertyValue("--preview-scale")).toBe("1.25");
    await show("next", onLogsObtained, "edit");
    expect(reset()).toBeNull();
    await show("next", onLogsObtained, "view");
    expect(reset().textContent).toBe("125%");
    await act(async () => reset().click());
    expect(scoreRoot.style.getPropertyValue("--preview-scale")).toBe("1");
    expect(renderer.renderSvg).toHaveBeenCalledTimes(2);
  });

  it("only intercepts modified wheel events, clamps zoom, and releases its listener", async () => {
    await show("score");
    const doc = container.querySelector("iframe").contentDocument;
    const plain = new WheelEvent("wheel", {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    doc.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    await act(async () =>
      doc.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -1,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(
      Number(
        doc.getElementById("root").style.getPropertyValue("--preview-scale"),
      ),
    ).toBeGreaterThan(1);
    const zoomIn = new WheelEvent("wheel", {
      deltaY: -100000,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => doc.dispatchEvent(zoomIn));
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')
        .disabled,
    ).toBe(true);
    expect(
      container.querySelector('[aria-label="Reset zoom"]').textContent,
    ).toBe("400%");
    await act(async () =>
      doc.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 100000,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')
        .disabled,
    ).toBe(true);
    expect(
      container.querySelector('[aria-label="Reset zoom"]').textContent,
    ).toBe("25%");
    await act(async () => root.render(null));
    const afterUnmount = new WheelEvent("wheel", {
      deltaY: 100,
      ctrlKey: true,
      cancelable: true,
    });
    doc.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });

  it("pans from a note without activating it, but preserves clicks with a small pointer movement", async () => {
    await show("score");
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () =>
      renders[0].resolve({
        files: [
          '<svg><a href="textedit:///tmp/hacklily.ly:1:0:2"><path d="M0 0"/></a></svg>',
        ],
        logs: "",
      }),
    );
    const doc = container.querySelector("iframe").contentDocument;
    const scroll = doc.scrollingElement || doc.documentElement;
    const note = doc.querySelector("path");
    scroll.scrollLeft = 100;
    scroll.scrollTop = 150;
    note.dispatchEvent(pointer("pointerdown", 200, 200));
    doc.dispatchEvent(pointer("pointermove", 120, 140));
    expect(scroll.scrollLeft).toBe(180);
    expect(scroll.scrollTop).toBe(210);
    expect(doc.documentElement.classList.contains("isPanning")).toBe(true);
    doc.dispatchEvent(pointer("pointerup", 120, 140, { buttons: 0 }));
    await act(async () =>
      note.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
    expect(onSelectionChanged).not.toHaveBeenCalled();
    expect(doc.documentElement.classList.contains("isPanning")).toBe(false);
    note.dispatchEvent(pointer("pointerdown", 120, 140));
    doc.dispatchEvent(pointer("pointermove", 122, 141));
    doc.dispatchEvent(pointer("pointerup", 122, 141, { buttons: 0 }));
    await act(async () =>
      note.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
    expect(onSelectionChanged).toHaveBeenCalledWith(
      expect.objectContaining({ positionLineNumber: 1 }),
    );
    expect(scroll.scrollLeft).toBe(180);
    expect(scroll.scrollTop).toBe(210);
  });

  it("ends dragging on cancellation and blur, and releases handlers on unmount", async () => {
    await show("score");
    const doc = container.querySelector("iframe").contentDocument;
    const scroll = doc.scrollingElement || doc.documentElement;
    doc.body.dispatchEvent(pointer("pointerdown", 100, 100));
    doc.dispatchEvent(pointer("pointermove", 50, 50));
    doc.dispatchEvent(pointer("pointercancel", 50, 50, { buttons: 0 }));
    expect(doc.documentElement.classList.contains("isPanning")).toBe(false);
    const afterCancel = scroll.scrollTop;
    doc.dispatchEvent(pointer("pointermove", 0, 0));
    expect(scroll.scrollTop).toBe(afterCancel);
    doc.body.dispatchEvent(pointer("pointerdown", 100, 100));
    doc.dispatchEvent(pointer("pointermove", 50, 50));
    doc.defaultView.dispatchEvent(new Event("blur"));
    expect(doc.documentElement.classList.contains("isPanning")).toBe(false);
    doc.body.dispatchEvent(pointer("pointerdown", 100, 100));
    doc.dispatchEvent(pointer("pointermove", 50, 50));
    await act(async () => root.render(null));
    expect(doc.documentElement.classList.contains("isPanning")).toBe(false);
    const afterUnmount = scroll.scrollTop;
    doc.body.dispatchEvent(pointer("pointerdown", 100, 100));
    doc.dispatchEvent(pointer("pointermove", 0, 0));
    expect(scroll.scrollTop).toBe(afterUnmount);
  });

  it("preserves native touch scrolling and the context menu, and supports the middle button", async () => {
    await show("score");
    const doc = container.querySelector("iframe").contentDocument;
    const scroll = doc.scrollingElement || doc.documentElement;
    const touch = pointer("pointerdown", 100, 100, { pointerType: "touch" });
    doc.body.dispatchEvent(touch);
    doc.dispatchEvent(pointer("pointermove", 0, 0, { pointerType: "touch" }));
    expect(touch.defaultPrevented).toBe(false);
    expect(scroll.scrollTop).toBe(0);
    const secondary = pointer("pointerdown", 100, 100, {
      button: 2,
      buttons: 2,
    });
    doc.body.dispatchEvent(secondary);
    doc.dispatchEvent(pointer("pointermove", 0, 0, { button: 2, buttons: 2 }));
    expect(secondary.defaultPrevented).toBe(false);
    expect(scroll.scrollTop).toBe(0);
    const middle = pointer("pointerdown", 100, 100, { button: 1, buttons: 4 });
    doc.body.dispatchEvent(middle);
    doc.dispatchEvent(
      pointer("pointermove", 50, 50, { button: 1, buttons: 4 }),
    );
    expect(middle.defaultPrevented).toBe(true);
    expect(scroll.scrollTop).toBe(50);
    doc.dispatchEvent(pointer("pointerup", 50, 50, { button: 1, buttons: 0 }));
    expect(doc.documentElement.classList.contains("isPanning")).toBe(false);
  });
});
