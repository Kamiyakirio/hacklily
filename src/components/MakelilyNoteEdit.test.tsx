import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { parseClef, parseKeySig, parseTime } from "#/lib/parseLy";
import { whenReady } from "#/satie/src/private_fontManager";

import ToolNoteEdit from "./MakelilyNoteEdit";

describe("note tool keyboard editing", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let originalPointFactory: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    originalPointFactory = Object.getOwnPropertyDescriptor(
      SVGSVGElement.prototype,
      "createSVGPoint",
    );
    Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", {
      configurable: true,
      value: () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) }),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    if (originalPointFactory)
      Object.defineProperty(
        SVGSVGElement.prototype,
        "createSVGPoint",
        originalPointFactory,
      );
    else delete SVGSVGElement.prototype.createSVGPoint;
    vi.unstubAllGlobals();
  });

  it("initializes the score cursor and handles insertion, undo and redo in Strict Mode", async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <ToolNoteEdit
            clef={parseClef("treble")}
            keySig={parseKeySig("d \\major")}
            time={parseTime("4/4")}
            onInsertLy={vi.fn()}
          />
        </StrictMode>,
      ),
    );
    await act(
      async () => new Promise<void>((resolve) => whenReady(() => resolve())),
    );
    const preview = () => container.querySelector("pre").textContent;
    const before = preview();
    expect(before.trim()).not.toBe("");
    const textbox = container.querySelector('[role="textbox"]');
    await act(async () =>
      textbox.dispatchEvent(
        new KeyboardEvent("keydown", { key: "c", bubbles: true }),
      ),
    );
    const inserted = preview();
    expect(inserted).not.toBe(before);
    expect(inserted).toContain("cis8");
    await act(async () =>
      textbox.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          bubbles: true,
        }),
      ),
    );
    expect(preview()).toBe(before);
    await act(async () =>
      textbox.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    expect(preview()).toBe(inserted);
  });
});
