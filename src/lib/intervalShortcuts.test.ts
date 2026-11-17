import {
  intervalShortcut,
  registerIntervalShortcuts,
} from "./intervalShortcuts";

describe("physical interval shortcuts", () => {
  it.each([
    { key: "£", code: "Digit3", shiftKey: false, interval: 3, direction: 1 },
    { key: "¡", code: "Digit1", shiftKey: false, interval: 1, direction: 1 },
    { key: "€", code: "Digit2", shiftKey: true, interval: 2, direction: -1 },
    { key: "8", code: "Numpad8", shiftKey: false, interval: 8, direction: 1 },
  ])(
    "recognizes $code independently of the generated character $key",
    ({ key, code, shiftKey, interval, direction }) => {
      expect(
        intervalShortcut(
          new KeyboardEvent("keydown", { key, code, altKey: true, shiftKey }),
        ),
      ).toEqual({ interval, direction });
    },
  );

  it("ignores other modifiers and keys", () => {
    for (const options of [
      { code: "Digit3" },
      { code: "Digit3", altKey: true, ctrlKey: true },
      { code: "Digit3", altKey: true, metaKey: true },
      { code: "Digit9", altKey: true },
      { code: "KeyZ", altKey: true },
    ]) {
      expect(
        intervalShortcut(new KeyboardEvent("keydown", options)),
      ).toBeNull();
    }
  });

  it("handles the event exactly once and stops text input and duplicate dispatch", () => {
    let receive: Parameters<
      Parameters<typeof registerIntervalShortcuts>[0]["onKeyDown"]
    >[0];
    const dispose = vi.fn();
    const onKeyDown = vi.fn((listener) => {
      receive = listener;
      return { dispose };
    });
    const apply = vi.fn();
    const registration = registerIntervalShortcuts({ onKeyDown }, apply);
    const browserEvent = new KeyboardEvent("keydown", {
      key: "£",
      code: "Digit3",
      altKey: true,
      cancelable: true,
    });
    const preventDefault = vi.fn(() => browserEvent.preventDefault());
    const stopPropagation = vi.fn();
    receive({
      _standardKeyboardEventBrand: true,
      browserEvent,
      target: document.createElement("textarea"),
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
      metaKey: false,
      altGraphKey: false,
      keyCode: 0,
      code: "Digit3",
      equals: () => false,
      preventDefault,
      stopPropagation,
    });
    expect(apply).toHaveBeenCalledExactlyOnceWith(3, 1);
    expect(browserEvent.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalledOnce();
    registration.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
