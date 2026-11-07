import { act } from "react";
import { createRoot } from "react-dom/client";

import EditorPreviewLayout from "./EditorPreviewLayout";
import type { ViewMode } from "./Header";

describe("editor and preview split", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function show(windowWidth = 1200, mode: ViewMode = "both") {
    await act(async () => {
      root.render(
        <EditorPreviewLayout mode={mode} windowWidth={windowWidth}>
          <div>Editor and preview</div>
        </EditorPreviewLayout>,
      );
    });
  }

  function separator() {
    return container.querySelector<HTMLElement>('[role="separator"]');
  }

  async function key(keyName: string, shiftKey = false) {
    await act(async () => {
      separator().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: keyName,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }

  it("supports keyboard resizing, bounds, reset, and persistence", async () => {
    await show();
    await key("ArrowRight", true);
    expect(separator().getAttribute("aria-valuenow")).toBe("60");
    expect(
      container
        .querySelector<HTMLElement>(".content")
        .style.getPropertyValue("--editor-width"),
    ).toBe("60%");
    expect(localStorage.getItem("hacklily.desktop.editorWidth")).toBe("60");
    await key("End");
    await key("ArrowRight");
    expect(separator().getAttribute("aria-valuenow")).toBe("80");
    await key("Home");
    await key("ArrowLeft");
    expect(separator().getAttribute("aria-valuenow")).toBe("20");
    await key("Enter");
    expect(separator().getAttribute("aria-valuenow")).toBe("50");
  });

  it("restores a saved ratio and preserves it across narrow layouts", async () => {
    localStorage.setItem("hacklily.desktop.editorWidth", "75");
    await show();
    expect(separator().getAttribute("aria-valuenow")).toBe("75");
    await show(640);
    expect(separator().getAttribute("aria-valuenow")).toBe("63");
    await show(500, "view");
    expect(separator()).toBeNull();
    await show();
    expect(separator().getAttribute("aria-valuenow")).toBe("75");
  });

  it("drags relative to its container and releases the iframe shield", async () => {
    await show();
    const split = separator();
    split.setPointerCapture = vi.fn();
    split.releasePointerCapture = vi.fn();
    vi.spyOn(split.parentElement, "getBoundingClientRect").mockReturnValue({
      left: 100,
      width: 1000,
    } as DOMRect);
    async function pointer(type: string, clientX: number) {
      const event = new MouseEvent(type, { clientX, button: 0, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: 7 });
      await act(async () => {
        split.dispatchEvent(event);
      });
    }
    await pointer("pointerdown", 600);
    await pointer("pointermove", 800);
    expect(split.getAttribute("aria-valuenow")).toBe("70");
    expect(container.querySelector(".z-30")).not.toBeNull();
    await pointer("pointerup", 800);
    expect(container.querySelector(".z-30")).toBeNull();
    expect(split.releasePointerCapture).toHaveBeenCalledWith(7);
    await pointer("pointermove", 200);
    expect(split.getAttribute("aria-valuenow")).toBe("70");
    await act(async () => {
      split.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(split.getAttribute("aria-valuenow")).toBe("50");
    await pointer("pointerdown", 600);
    await show(500, "view");
    await show();
    expect(container.querySelector(".z-30")).toBeNull();
  });
});
