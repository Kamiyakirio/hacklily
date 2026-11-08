import { act } from "react";
import { createRoot } from "react-dom/client";

import MusicNotationPalette from "./MusicNotationPalette";

describe("music notation palette", () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  const insert = vi.fn();
  const hide = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    insert.mockReset();
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
      root.render(<MusicNotationPalette onInsert={insert} onHide={hide} />),
    );
  }
  async function search(value: string) {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search music symbols"]',
    );
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => {
      set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  function entries() {
    return [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Insert "]',
      ),
    ];
  }

  it("shows musical glyphs and source, and inserts the selected writing", async () => {
    await show();
    const fermata = entries().find((button) =>
      button.getAttribute("aria-label").startsWith("Insert Fermata:"),
    );
    expect(fermata.querySelector("code").textContent).toBe("\\fermata");
    expect(fermata.querySelector(".music-notation-glyph").textContent).toBe(
      "\uE4C0",
    );
    expect(fermata.title).toContain("c4\\fermata");
    await act(async () => fermata.click());
    expect(insert).toHaveBeenCalledExactlyOnceWith("\\fermata");
    expect(hide).toHaveBeenCalledOnce();
  });

  it("searches by English name and LilyPond code and shows empty results", async () => {
    await show();
    await search("crescendo");
    expect(entries()).toHaveLength(1);
    expect(entries()[0].querySelector("code").textContent).toBe("\\<");
    await search("FERMATA");
    expect(entries()).toHaveLength(1);
    expect(entries()[0].textContent).toContain("Fermata");
    await search("\\sfz");
    expect(entries()).toHaveLength(1);
    expect(entries()[0].textContent).toContain("Sforzato");
    await search("not a symbol");
    expect(entries()).toHaveLength(0);
    expect(document.body.textContent).toContain("No matching music symbols.");
    expect(insert).not.toHaveBeenCalled();
  });

  it("filters by category without inserting or closing", async () => {
    await show();
    const category = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Ornaments",
    );
    await act(async () => category.click());
    expect(category.getAttribute("aria-pressed")).toBe("true");
    expect(entries()).toHaveLength(4);
    expect(
      entries().some((button) => button.textContent.includes("Trill")),
    ).toBe(true);
    expect(insert).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });
});
