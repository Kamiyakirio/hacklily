import { act } from "react";
import { createRoot } from "react-dom/client";

import NewScoreWizard from "./NewScoreWizard";

describe("new score wizard", () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  const create = vi.fn();
  const hide = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    create.mockReset();
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
  async function show() {
    await act(async () =>
      root.render(<NewScoreWizard onCreate={create} onHide={hide} />),
    );
  }
  function button(text: string) {
    return [...document.querySelectorAll("button")].find(
      (entry) =>
        entry.getAttribute("aria-label") === text ||
        entry.textContent.trim() === text,
    );
  }
  async function click(text: string) {
    await act(async () => button(text).click());
  }
  async function fill(label: string, value: string) {
    const field = [...document.querySelectorAll("label")]
      .find((entry) => entry.querySelector("span")?.textContent === label)
      .querySelector("input");
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => {
      set.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("keeps violin as one instrument and creates distinct quartet parts", async () => {
    await show();
    expect(
      document.querySelector('button[aria-label="Add Flute"]'),
    ).not.toBeNull();
    await click("Strings");
    expect(document.querySelector('button[aria-label="Add Flute"]')).toBeNull();
    expect(button("Strings").getAttribute("aria-pressed")).toBe("true");
    expect(
      document.querySelectorAll('button[aria-label="Add Violin"]'),
    ).toHaveLength(1);
    expect(button("Next").disabled).toBe(true);
    await click("String quartet");
    await click("Next");
    const names = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[aria-label^="Part name for"]',
      ),
    ].map((input) => input.value || input.placeholder);
    expect(names).toEqual(["Violin I", "Violin II", "Viola", "Cello"]);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows returning to invalid music settings, preserves edits, and generates only on completion", async () => {
    await show();
    await click("Piano solo");
    await click("Next");
    await click("Next");
    await act(async () => {
      const mode = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Mode"]',
      );
      mode.value = "minor";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      const key = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Concert key signature"]',
      );
      key.value = "-3";
      key.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await fill("Tempo (BPM)", "");
    expect(button("Next").disabled).toBe(true);
    await click("Back");
    expect(button("Next").disabled).toBe(false);
    await click("Next");
    expect(button("Next").disabled).toBe(true);
    await fill("Tempo (BPM)", "84");
    await click("6/8");
    await click("Next");
    await fill("Title", "My suite");
    await fill("Composer", "A composer");
    await click("Back");
    await click("Next");
    expect(
      document.querySelector<HTMLInputElement>('input[placeholder="Untitled"]')
        .value,
    ).toBe("My suite");
    expect(create).not.toHaveBeenCalled();
    await click("Create score");
    expect(create).toHaveBeenCalledOnce();
    const source = create.mock.calls[0][0];
    expect(source).toContain('title = "My suite"');
    expect(source).toContain('composer = "A composer"');
    expect(source).toContain("\\time 6/8");
    expect(source).toContain("\\key c \\minor");
    expect(source).toContain("\\tempo 4. = 84");
    expect(source).toContain("\\new PianoStaff");
  });
});
