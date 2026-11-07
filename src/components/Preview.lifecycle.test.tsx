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

  async function show(code: string, logsCallback = onLogsObtained) {
    await act(async () =>
      root.render(
        <Preview
          code={code}
          logs=""
          mode="both"
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
});
