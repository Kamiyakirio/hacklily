import { act } from "react";
import { createRoot } from "react-dom/client";

import type { AssociationStatus } from "#/lib/fileAssociations";

import ModalFileAssociations from "./ModalFileAssociations";

const native = vi.hoisted(() => ({
  status: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("#/lib/fileAssociations", () => ({
  fileAssociationStatus: native.status,
  registerFileAssociation: native.register,
  unregisterFileAssociation: native.unregister,
  openDefaultApps: native.settings,
}));

describe("file association controls", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let status: AssociationStatus;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    status = {
      supported: true,
      platform: "windows",
      registered: false,
      isDefault: false,
      currentDefault: "Other editor",
      previousDefault: null,
    };
    native.status.mockImplementation(async () => status);
    native.settings.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function show() {
    await act(async () =>
      root.render(<ModalFileAssociations onHide={() => {}} />),
    );
  }
  async function click(text: string) {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === text,
    );
    expect(button).toBeDefined();
    await act(async () => button.click());
  }

  it("registers a Windows candidate and opens the system confirmation", async () => {
    native.register.mockImplementation(async () => ({
      ...status,
      registered: true,
      previousDefault: "Other editor",
    }));
    await show();
    await click("Register and choose default");
    expect(native.register).toHaveBeenCalledOnce();
    expect(native.settings).toHaveBeenCalledWith(true);
    expect(document.body.textContent).toContain(
      "Previous default: Other editor",
    );
  });

  it("waits for Windows default selection before removing registration", async () => {
    status = {
      ...status,
      registered: true,
      isDefault: true,
      currentDefault: "Hacklily",
      previousDefault: "Other editor",
    };
    native.unregister.mockImplementation(async () => ({
      ...status,
      registered: false,
    }));
    await show();
    await click("Cancel association");
    expect(native.settings).toHaveBeenCalledWith(false);
    expect(native.unregister).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(native.unregister).not.toHaveBeenCalled();
    status = { ...status, isDefault: false, currentDefault: "Other editor" };
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(native.unregister).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain(
      "Your selected default app is preserved",
    );
  });

  it.each(["macos", "linux"] as const)(
    "registers and restores defaults directly on %s",
    async (platform) => {
      status = { ...status, platform };
      native.register.mockImplementation(async () => {
        status = {
          ...status,
          registered: true,
          isDefault: true,
          previousDefault: "Other editor",
        };
        return status;
      });
      native.unregister.mockImplementation(async () => ({
        ...status,
        registered: false,
        isDefault: false,
        currentDefault: "Other editor",
      }));
      await show();
      await click("Set as default for .ly");
      expect(native.register).toHaveBeenCalledOnce();
      await click("Cancel association");
      expect(native.unregister).toHaveBeenCalledOnce();
      expect(native.settings).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain("Default app: Other editor");
    },
  );

  it("keeps the registration visible when removal fails", async () => {
    status = { ...status, registered: true };
    native.unregister.mockRejectedValue(new Error("Permission denied"));
    await show();
    await click("Cancel association");
    expect(document.querySelector('[role="alert"]').textContent).toContain(
      "Permission denied",
    );
    expect(document.body.textContent).toContain("Hacklily is registered");
  });
});
