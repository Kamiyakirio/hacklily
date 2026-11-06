// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { act } from "react";
import { createRoot } from "react-dom/client";

import type { Note } from "#/musicxml-interfaces";
import { MxmlAccidental } from "#/musicxml-interfaces";

import { Type } from "../document";
import NoteView from "../implChord_noteView";
import type { IProps as PageProps } from "../implPage_pageView";
import Page from "../implPage_pageView";
import * as fontManager from "../private_fontManager";
import type { RenderContextValue } from "../private_renderContext";
import { RenderContext } from "../private_renderContext";
import { get as findScoreElement } from "../private_views_metadata";

describe("score rendering with React context", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("positions staff lines and bar numbers through page, measure and model providers", async () => {
    const props = {
      scoreHeader: {
        defaults: { scaling: { millimeters: 7, tenths: 40 } },
        credits: [],
      },
      print: {
        pageNumber: "1",
        pageLayout: { pageWidth: 800, pageHeight: 1000 },
      },
      lineLayouts: [
        [
          {
            uuid: 1,
            originX: 20,
            originY: { P1: [null, 200] },
            width: 300,
            getVersion: () => 1,
            elements: [
              [
                {
                  key: "attributes",
                  part: "P1",
                  model: { staffIdx: 1 },
                  renderClass: Type.Attributes,
                  x: 0,
                  renderedWidth: 300,
                  overrideX: 0,
                  staffWidth: 300,
                  staffLinesOffsetX: 0,
                  staffDetails: { staffLines: 5 },
                  measureNumberVisible: "1",
                },
              ],
            ],
          },
        ],
      ],
      renderTarget: "svg-web",
      className: "score",
    } as unknown as PageProps;

    await act(async () => root.render(<Page {...props} />));
    expect(container.querySelectorAll("line")).toHaveLength(5);
    expect(container.querySelector("line").getAttribute("y1")).toBe("820");
    expect(container.querySelector("text.bn_").getAttribute("y")).toBe("770");
    expect(findScoreElement({ x: 20, y: 800 })?.key).toBe("attributes");

    // Context changes must reach models even when their layout version is unchanged.
    await act(async () =>
      root.render(
        <Page
          {...props}
          print={{
            ...props.print,
            pageLayout: { ...props.print.pageLayout, pageHeight: 1200 },
          }}
        />,
      ),
    );
    expect(container.querySelector("line").getAttribute("y1")).toBe("1020");
    expect(container.querySelector("text.bn_").getAttribute("y")).toBe("970");
    expect(findScoreElement({ x: 20, y: 800 })).toBeNull();
    expect(findScoreElement({ x: 20, y: 1000 })?.key).toBe("attributes");
    await act(async () => root.render(null));
    expect(findScoreElement({ x: 20, y: 1000 })).toBeNull();
  });

  it("applies a note's vertical offset to its notehead and accidental", async () => {
    const context: RenderContextValue = {
      originY: 800,
      originYByPartAndStaff: {},
      systemBottom: 820,
      systemTop: 780,
      scale40: 7,
      renderTarget: "svg-web",
    };
    const spec = {
      defaultX: 50,
      defaultY: 10,
      color: "black",
      accidental: {
        accidental: MxmlAccidental.Sharp,
        defaultX: -15,
        defaultY: 0,
        color: "black",
      },
    } as Note;

    await act(async () =>
      root.render(
        <svg>
          <RenderContext value={context}>
            <NoteView spec={spec} noteheadGlyph="noteheadBlack" />
          </RenderContext>
        </svg>,
      ),
    );
    const glyphs = container.querySelectorAll("text.mn_");
    expect(glyphs).toHaveLength(2);
    expect([...glyphs].map((glyph) => glyph.getAttribute("y"))).toEqual([
      "790",
      "790",
    ]);
    expect([...glyphs].map((glyph) => glyph.getAttribute("x"))).toEqual([
      "50",
      "35",
    ]);

    const toPathData = vi
      .spyOn(fontManager, "toPathData")
      .mockReturnValue("M0 0");
    await act(async () =>
      root.render(
        <svg>
          <RenderContext value={{ ...context, renderTarget: "svg-export" }}>
            <NoteView spec={spec} noteheadGlyph="noteheadBlack" />
          </RenderContext>
        </svg>,
      ),
    );
    expect(container.querySelectorAll("text")).toHaveLength(0);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(toPathData).toHaveBeenCalledWith(
      "Bravura",
      expect.any(String),
      50,
      790,
      40,
    );
  });
});
