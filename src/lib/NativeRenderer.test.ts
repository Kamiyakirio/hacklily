import { Channel, invoke } from "@tauri-apps/api/core";

import NativeRenderer, { encodeBytes, prepareEngine } from "./NativeRenderer";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  Channel: class {
    onmessage = () => {};
  },
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

describe("native LilyPond bridge", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("cancels stale previews without cancelling PDF exports", async () => {
    const requests: {
      format: string;
      requestId: string;
      resolve: (result: unknown) => void;
    }[] = [];
    vi.mocked(invoke).mockImplementation(
      (command, args: Record<string, unknown>) => {
        if (command === "render_score")
          return new Promise((resolve) =>
            requests.push({ ...args, resolve } as (typeof requests)[number]),
          );
        return Promise.resolve(undefined);
      },
    );
    const renderer = new NativeRenderer("C:/Scores");
    const preview = renderer.renderSvg("source", "stable");
    const pdf = renderer.renderPdf("source");
    renderer.cancel();
    expect(invoke).toHaveBeenCalledWith("cancel_render", {
      requestId: requests[0].requestId,
    });
    expect(invoke).not.toHaveBeenCalledWith("cancel_render", {
      requestId: requests[1].requestId,
    });
    expect(invoke).toHaveBeenCalledWith(
      "render_score",
      expect.objectContaining({
        includeDir: "C:/Scores",
        src: "source",
        format: "svg",
      }),
    );
    requests[0].resolve({ files: ["<svg/>"], logs: "", midi: null });
    requests[1].resolve({ files: ["pdf-base64"], logs: "", midi: null });
    await preview;
    expect(await pdf).toBe("pdf-base64");
    renderer.destroy();
    await expect(renderer.renderSvg("closed", "stable")).rejects.toThrow(
      "Renderer is closed",
    );
  });

  it("uses a progress channel for engine installation", async () => {
    vi.mocked(invoke).mockResolvedValue({ version: "2.26.0" });
    await expect(prepareEngine(vi.fn())).resolves.toEqual({
      version: "2.26.0",
    });
    expect(invoke).toHaveBeenCalledWith("prepare_engine", {
      onProgress: expect.any(Channel),
    });
  });

  it("preserves native compilation errors for the preview", async () => {
    vi.mocked(invoke).mockRejectedValue("LilyPond timed out after 60 seconds");
    const cause = await new NativeRenderer()
      .renderSvg("source", "stable")
      .catch((error: unknown) => error);
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toBe(
      "LilyPond timed out after 60 seconds",
    );
  });

  it("encodes large MIDI buffers and Unicode source without losing bytes", () => {
    const bytes = new Uint8Array(90000).map((_, index) => index % 256);
    expect(
      Uint8Array.from(atob(encodeBytes(bytes)), (character) =>
        character.charCodeAt(0),
      ),
    ).toEqual(bytes);
    const text = new TextEncoder().encode("音乐 🎵");
    expect(
      new TextDecoder().decode(
        Uint8Array.from(atob(encodeBytes(text)), (character) =>
          character.charCodeAt(0),
        ),
      ),
    ).toBe("音乐 🎵");
  });
});
