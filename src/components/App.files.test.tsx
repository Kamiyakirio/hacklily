import { act } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { TooltipProvider } from "./ui/tooltip";

const native = vi.hoisted(() => ({
  openScore: vi.fn(),
  saveScore: vi.fn(),
  prepareEngine: vi.fn(),
  destroy: vi.fn(),
  setTitle: vi.fn(),
  onCloseRequested: vi.fn(),
  watchOpenRequests: vi.fn(),
  openScorePath: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    destroy: native.destroy,
    setTitle: native.setTitle,
    onCloseRequested: native.onCloseRequested,
  }),
}));
vi.mock("./useColourScheme", () => ({ useColourScheme: () => "light" }));
vi.mock("./Editor", () => ({
  default: ({
    code,
    onSetCode,
  }: {
    code: string;
    onSetCode(src: string): void;
  }) => (
    <textarea
      aria-label="Source"
      value={code}
      onChange={(event) => onSetCode(event.target.value)}
    />
  ),
}));
vi.mock("./Preview", () => ({ default: () => <div>Local preview</div> }));
vi.mock("./NewScoreWizard", () => ({
  default: ({
    onCreate,
    onHide,
  }: {
    onCreate(source: string): void;
    onHide(): void;
  }) => (
    <div role="dialog" aria-label="New score">
      <button onClick={() => onCreate('\\version "2.26.0"\n% Wizard score')}>
        Create score
      </button>
      <button onClick={onHide}>Cancel wizard</button>
    </div>
  ),
}));
vi.mock("#/lib/NativeRenderer", () => ({
  default: class {
    cancel() {}
  },
  prepareEngine: native.prepareEngine,
  openScore: native.openScore,
  openScorePath: native.openScorePath,
  watchOpenRequests: native.watchOpenRequests,
  saveScore: native.saveScore,
  importMusicXML: vi.fn(),
  saveExport: vi.fn(),
  encodeBytes: vi.fn(),
  openExternal: vi.fn(),
}));

describe("desktop local documents", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let receivePaths: (paths: string[]) => void;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    localStorage.clear();
    native.prepareEngine.mockResolvedValue({ version: "2.26.0" });
    native.onCloseRequested.mockResolvedValue(vi.fn());
    native.watchOpenRequests.mockImplementation((receive) => {
      receivePaths = receive;
      return vi.fn();
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function show() {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>,
      ),
    );
  }
  async function shortcut(keyName: string) {
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: keyName,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  }
  function restoreDraft() {
    localStorage.setItem(
      "hacklily.desktop.draft",
      JSON.stringify({
        src: "edited",
        savedSrc: "original",
        path: "C:/Music/score.ly",
        includeDir: "C:/Music",
      }),
    );
  }
  async function createFromWizard() {
    const create = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Create score",
    );
    await act(async () => create.click());
  }

  it("opens local files and preserves cancellation without replacing the document", async () => {
    native.openScore
      .mockResolvedValueOnce({ path: "C:/Music/local.ly", src: "local music" })
      .mockResolvedValueOnce(null);
    await show();
    await shortcut("o");
    expect(container.querySelector("textarea").value).toBe("local music");
    await shortcut("o");
    expect(container.querySelector("textarea").value).toBe("local music");
    await shortcut("s");
    expect(native.saveScore).toHaveBeenCalledWith(
      "local music",
      "C:/Music/local.ly",
    );
  });

  it("opens queued associated files after protecting unsaved work", async () => {
    restoreDraft();
    native.openScorePath.mockImplementation(async (path) => ({
      path,
      src: `Source of ${path}`,
    }));
    await show();
    await act(async () =>
      receivePaths(["C:/Music/乐谱 one.ly", "C:/Music/second.ly"]),
    );
    expect(document.body.textContent).toContain("Unsaved changes");
    expect(container.querySelector("textarea").value).toBe("edited");
    const discard = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Discard changes",
    );
    await act(async () => discard.click());
    expect(container.querySelector("textarea").value).toBe(
      "Source of C:/Music/second.ly",
    );
    expect(native.openScore).not.toHaveBeenCalled();
    expect(native.openScorePath).toHaveBeenCalledWith("C:/Music/乐谱 one.ly");
    await shortcut("s");
    expect(native.saveScore).toHaveBeenCalledWith(
      "Source of C:/Music/second.ly",
      "C:/Music/second.ly",
    );
  });

  it("retains the current document if the user cancels an associated-file open", async () => {
    restoreDraft();
    native.openScorePath.mockResolvedValue({
      path: "C:/Music/incoming.ly",
      src: "incoming",
    });
    await show();
    await act(async () => receivePaths(["C:/Music/incoming.ly"]));
    const cancel = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Cancel",
    );
    await act(async () => cancel.click());
    expect(container.querySelector("textarea").value).toBe("edited");
    expect(document.body.textContent).not.toContain("Unsaved changes");
  });

  it("keeps the current document when saving before a new document is cancelled", async () => {
    restoreDraft();
    native.saveScore.mockResolvedValue(null);
    await show();
    await shortcut("n");
    await createFromWizard();
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Save",
    );
    await act(async () => save.click());
    expect(native.saveScore).toHaveBeenCalledWith(
      "edited",
      "C:/Music/score.ly",
    );
    expect(container.querySelector("textarea").value).toBe("edited");
    expect(document.body.textContent).toContain("Unsaved changes");
  });

  it("saves successfully before replacing an edited document", async () => {
    restoreDraft();
    native.saveScore.mockResolvedValue("C:/Music/score.ly");
    await show();
    await shortcut("n");
    await createFromWizard();
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Save",
    );
    await act(async () => save.click());
    expect(native.saveScore).toHaveBeenCalledWith(
      "edited",
      "C:/Music/score.ly",
    );
    expect(container.querySelector("textarea").value).toContain(
      '\\version "2.26.0"',
    );
    expect(document.body.textContent).not.toContain("Unsaved changes");
    expect(
      JSON.parse(localStorage.getItem("hacklily.desktop.draft")).savedSrc,
    ).toBe("");
  });

  it("leaves an unsaved document intact when the wizard is cancelled", async () => {
    restoreDraft();
    await show();
    await shortcut("n");
    expect(document.body.textContent).not.toContain("Unsaved changes");
    expect(container.querySelector("textarea").value).toBe("edited");
    const cancel = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel wizard",
    );
    await act(async () => cancel.click());
    expect(
      JSON.parse(localStorage.getItem("hacklily.desktop.draft")).path,
    ).toBe("C:/Music/score.ly");
    expect(container.querySelector("textarea").value).toBe("edited");
    expect(native.saveScore).not.toHaveBeenCalled();
  });

  it("waits to process associated files until the wizard closes", async () => {
    native.openScorePath.mockResolvedValue({
      path: "C:/Music/waiting.ly",
      src: "waiting score",
    });
    await show();
    await shortcut("n");
    await act(async () => receivePaths(["C:/Music/waiting.ly"]));
    expect(native.openScorePath).not.toHaveBeenCalled();
    const cancel = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel wizard",
    );
    await act(async () => cancel.click());
    expect(container.querySelector("textarea").value).toBe("waiting score");
  });
});
