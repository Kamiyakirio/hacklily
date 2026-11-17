import { act } from "react";
import { createRoot } from "react-dom/client";

import { MUSIC_NOTATION_GROUPS } from "#/lib/musicNotations";

import MusicSymbolPanel from "./MusicSymbolPanel";

describe("music symbol panel", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const useNotation = vi.fn();
  const hide = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useNotation.mockReset().mockReturnValue(true);
    hide.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function show(count = 0, disabled = false) {
    await act(async () =>
      root.render(
        <MusicSymbolPanel
          selectedNoteCount={count}
          disabled={disabled}
          onUseNotation={useNotation}
          onHide={hide}
        />,
      ),
    );
  }
  async function category(label: string) {
    const tab = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ].find((button) => button.textContent === label);
    await act(async () => tab.click());
  }
  function symbol(label: string) {
    return [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
    ].find((button) => button.getAttribute("aria-label").includes(label));
  }

  it("shows categorized symbols inline and switches categories without closing", async () => {
    await show();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(
      MUSIC_NOTATION_GROUPS.length,
    );
    expect(
      container.querySelectorAll('button[aria-label^="Insert "]'),
    ).toHaveLength(MUSIC_NOTATION_GROUPS[0].items.length);
    await category("Ornaments");
    expect(
      symbol("Insert Trill:").querySelector(".music-notation-glyph")
        .textContent,
    ).toBe("\uE566");
    expect(useNotation).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("follows the editor's live note selection and applies a marking without hiding", async () => {
    await show();
    await category("Articulations");
    expect(symbol("Insert Staccato:")).toBeDefined();
    await show(4);
    expect(container.querySelector('[role="status"]').textContent).toContain(
      "4 notes selected",
    );
    const staccato = symbol("Apply Staccato:");
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => staccato.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    await act(async () => staccato.click());
    expect(useNotation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "-\\staccato", application: "each" }),
    );
    expect(hide).not.toHaveBeenCalled();
    expect(
      container.querySelector('[aria-label="Music symbol panel"]'),
    ).not.toBeNull();
  });

  it("offers single-note and alternating tremolos with the appropriate selection", async () => {
    await show(1);
    await category("Tremolos");
    expect(symbol("Apply Single-note tremolo (1/32):").disabled).toBe(false);
    expect(symbol("Apply Two-note tremolo (1/32):").disabled).toBe(true);
    await show(2);
    const pair = symbol("Apply Two-note tremolo (1/32):");
    expect(pair.disabled).toBe(false);
    await act(async () => pair.click());
    expect(useNotation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        application: "tremoloPair",
        tremoloDivision: 32,
      }),
    );
  });

  it("inserts when there is no selection and applies tempo around selected notes", async () => {
    await show();
    await category("Tempo & expression");
    await act(async () => symbol("Insert Metronome mark:").click());
    expect(useNotation).toHaveBeenCalledWith(
      expect.objectContaining({ code: "\\tempo 4 = 120" }),
    );
    await show(3);
    expect(symbol("Apply Metronome mark:").disabled).toBe(false);
  });

  it("reports an incompatible selection without closing or inserting anything else", async () => {
    await show(2);
    useNotation.mockReturnValue(false);
    await act(async () => symbol("Apply Piano:").click());
    expect(container.querySelector('[role="alert"]').textContent).toContain(
      "compatible note selection",
    );
    expect(hide).not.toHaveBeenCalled();
  });

  it("disables notation changes while working and provides a separate close button", async () => {
    await show(3, true);
    expect(symbol("Apply Piano:").disabled).toBe(true);
    await act(async () => symbol("Hide music symbol panel").click());
    expect(hide).toHaveBeenCalledOnce();
    expect(useNotation).not.toHaveBeenCalled();
  });
});
