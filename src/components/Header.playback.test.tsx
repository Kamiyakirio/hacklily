import type { ComponentProps } from "react";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "#/components/ui/button";
import { TooltipProvider } from "#/components/ui/tooltip";

import Header from "./Header";

const { loadPlayer } = vi.hoisted(() => ({ loadPlayer: vi.fn() }));
vi.mock("hackmidi", () => ({ playerFromMIDIBuffer: loadPlayer }));
vi.mock("#/lib/analytics", () => ({ track: vi.fn() }));

function headerProps(midi: ArrayBuffer): ComponentProps<typeof Header> {
  return {
    midi,
    canExport: false,
    canSave: true,
    midiAvailable: true,
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onImportMusicXML: vi.fn(),
    mode: "both",
    windowWidth: 1000,
    wordWrap: false,
    onWordWrapChanged: vi.fn(),
    onModeChanged: vi.fn(),
    onShowMakelily: vi.fn(),
    onShowNew: vi.fn(),
    onShowOpen: vi.fn(),
    onExportLy: vi.fn(),
    onExportMIDI: vi.fn(),
    onExportPDF: vi.fn(),
    onShowAbout: vi.fn(),
    onShowFileAssociations: vi.fn(),
    onInsertNotation: vi.fn(),
  };
}

describe("playback and React 19 refs", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let player: {
    addChangeListener: ReturnType<typeof vi.fn>;
    removeChangeListener: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    getDuration: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    seek: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    player = {
      addChangeListener: vi.fn(),
      removeChangeListener: vi.fn(),
      destroy: vi.fn(),
      getDuration: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      seek: vi.fn(),
    };
    loadPlayer.mockResolvedValue(player);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function show(midi: ArrayBuffer) {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <Header {...headerProps(midi)} />
        </TooltipProvider>,
      ),
    );
  }

  async function play() {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === "Play",
    );
    await act(async () => button.click());
  }

  it("releases the player and listener when the MIDI buffer changes", async () => {
    await show(new ArrayBuffer(8));
    await play();
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.addChangeListener).toHaveBeenCalledTimes(1);
    await show(new ArrayBuffer(16));
    expect(player.removeChangeListener).toHaveBeenCalledTimes(1);
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[title="Pause"]')).toBeNull();
  });

  it("disposes a player that finishes loading after unmount", async () => {
    let finish: (value: typeof player) => void;
    loadPlayer.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await show(new ArrayBuffer(8));
    await play();
    await act(async () => root.render(null));
    await act(async () => finish(player));
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.addChangeListener).not.toHaveBeenCalled();
  });

  it("passes an ordinary ref prop through Button to its DOM element", async () => {
    const ref = createRef<HTMLButtonElement>();
    await act(async () => root.render(<Button ref={ref}>Focus</Button>));
    expect(ref.current).toBe(container.querySelector("button"));
    ref.current.focus();
    expect(document.activeElement).toBe(ref.current);
    await act(async () => root.render(null));
    expect(ref.current).toBeNull();
  });
});
