import {
  applyMusicNotation,
  applyMusicNotationToRanges,
  selectedNoteCount,
} from "./applyMusicNotation";
import { MUSIC_NOTATION_GROUPS } from "./musicNotations";

const notations = MUSIC_NOTATION_GROUPS.flatMap((group) => group.items);
function apply(source: string, code: string, start = 0, end = source.length) {
  const change = applyMusicNotation(
    source,
    start,
    end,
    notations.find((item) => item.code === code),
  );
  return change
    ? source.slice(0, change.start) + change.text + source.slice(change.end)
    : source;
}

describe("applying music notations to selected notes", () => {
  it("applies markings to separate staff selections and keeps each source range selected", () => {
    const source = "{ c4 d4 }\n{ e4 f4 }";
    const ranges = [
      { start: 2, end: 7 },
      { start: 12, end: 17 },
    ];
    const result = applyMusicNotationToRanges(
      source,
      ranges,
      notations.find((item) => item.code === "-\\accent"),
    );
    let updated = source;
    for (const edit of result.edits.toSorted((a, b) => b.start - a.start))
      updated =
        updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
    expect(updated).toBe(
      "{ c4-\\accent d4-\\accent }\n{ e4-\\accent f4-\\accent }",
    );
    expect(
      result.selections.map((range) => updated.slice(range.start, range.end)),
    ).toEqual(["c4-\\accent d4-\\accent", "e4-\\accent f4-\\accent"]);
  });
  it("marks each selected note, preserving rests, whitespace, and existing events", () => {
    const source = "{ c4 d8. r16 e'4\\p\n  fis,2~ fis2 }";
    const start = source.indexOf("d8");
    const end = source.indexOf("fis2");
    expect(apply(source, "-\\staccato", start, end)).toBe(
      "{ c4 d8.-\\staccato r16 e'4-\\staccato\\p\n  fis,2-\\staccato~ fis2 }",
    );
    expect(selectedNoteCount(source, start, end)).toBe(3);
  });

  it("treats whole chords and chord repetitions as notes, including complex durations", () => {
    const source = "<c' ees' g'>2.*3/2 q8 c!16 d?8 e'\\breve f4:16";
    expect(selectedNoteCount(source, 0, source.length)).toBe(6);
    expect(apply(source, "-\\accent")).toBe(
      "<c' ees' g'>2.*3/2-\\accent q8-\\accent c!16-\\accent d?8-\\accent e'\\breve-\\accent f4:16-\\accent",
    );
  });

  it("ignores comments, lyrics, markup, strings, Scheme, and pitch arguments", () => {
    const source = String.raw`\header { title = "c4 d4" }
% c4 d4
%{ e4 %{ f4 %} g4 %}
#(display '(a b c))
\relative c' {
  \key ees \major
  \transpose c d { e4^\markup { f4 { g4 } } a4 }
  b4^\markup \italic "c4 d4"
}
\lyricmode { do re mi }
\lyricsto "voice" { a b c }
\addlyrics { do re mi }`;
    expect(selectedNoteCount(source, 0, source.length)).toBe(3);
    expect(apply(source, "\\fermata")).toBe(
      source
        .replace("e4^", "e4\\fermata^")
        .replace("a4 }", "a4\\fermata }")
        .replace("b4^", "b4\\fermata^"),
    );
    const commentStart = source.indexOf("% c4");
    expect(selectedNoteCount(source, commentStart, commentStart + 7)).toBe(0);
  });

  it("uses the whole document to interpret selections inside comments and metadata", () => {
    const source = "\\relative c' { c4 d4 } % e4\n\\markup { f4 }";
    const root = source.indexOf("c'");
    expect(selectedNoteCount(source, root, root + 2)).toBe(0);
    const commentNote = source.indexOf("e4");
    expect(selectedNoteCount(source, commentNote, commentNote + 2)).toBe(0);
    const markupNote = source.indexOf("f4");
    expect(selectedNoteCount(source, markupNote, markupNote + 2)).toBe(0);
    const note = source.indexOf("c4");
    const change = applyMusicNotation(
      source,
      note,
      note + 1,
      notations.find((item) => item.code === "\\trill"),
    );
    expect(change).toEqual({ start: note, end: note + 2, text: "c4\\trill" });
  });

  it("keeps the first note of a relative expression with no reference pitch", () => {
    expect(apply("\\relative { c4 d4 }", "-\\tenuto")).toBe(
      "\\relative { c4-\\tenuto d4-\\tenuto }",
    );
  });

  it("keeps marked notes selectable for another application and separates named articulations", () => {
    const original = "c4 d e f";
    const staccato = apply(original, "-\\staccato");
    expect(selectedNoteCount(staccato, 0, staccato.length)).toBe(4);
    expect(apply(staccato, "-\\accent")).toBe(
      "c4-\\accent -\\staccato d-\\accent -\\staccato e-\\accent -\\staccato f-\\accent -\\staccato",
    );
    expect(apply(staccato, "-\\staccato")).toBe(staccato);
    expect(selectedNoteCount("c4-. d-> e-- f-1", 0, 100)).toBe(4);
  });

  it.each([
    ["(", "c8( d8 r8 e8)"],
    ["[", "c8[ d8 r8 e8]"],
    ["\\<", "c8\\< d8 r8 e8\\!"],
    ["\\>", "c8\\> d8 r8 e8\\!"],
  ])(
    "applies %s to the endpoints of the selected passage",
    (code, expected) => {
      expect(apply("c8 d8 r8 e8", code)).toBe(expected);
    },
  );

  it("starts a dynamic on the first selected note and adds breaths at the end", () => {
    expect(apply("c4 d4 r4 e4", "\\mf")).toBe("c4\\mf d4 r4 e4");
    expect(apply("c4 d4 r4 e4", "\\breathe")).toBe("c4 d4 r4 e4 \\breathe");
  });

  it("ties adjacent selected notes without a trailing tie or a tie across a rest", () => {
    expect(apply("c4 c4 r4 c4 c4", "~")).toBe("c4~ c4 r4 c4~ c4");
  });

  it("does not repeat existing markings or mistake longer dynamic names and comments for them", () => {
    expect(apply("c4-\\staccato d4^\\staccato e4", "-\\staccato")).toBe(
      "c4-\\staccato d4^\\staccato e4-\\staccato",
    );
    expect(apply("c4\\pp d4", "\\p")).toBe("c4\\p d4");
    expect(apply("c4 % \\fermata\nd4", "\\fermata")).toBe(
      "c4\\fermata % \\fermata\nd4\\fermata",
    );
    const slur = apply("c4 d4 e4", "(");
    expect(apply(slur, "(")).toBe(slur);
    expect(apply("c4-. d4^. e4_.", "-\\staccato")).toBe("c4-. d4^. e4_.");
    expect(apply("c4-> d4->", "-\\accent")).toBe("c4-> d4->");
  });

  it("updates an existing dynamic even when only its note name is selected", () => {
    expect(apply("c4^\\pp d4\\f", "\\mf", 0, 1)).toBe("c4^\\mf d4\\f");
  });

  it("leaves an empty or non-musical selection unchanged", () => {
    expect(apply("c4 d4", "-\\accent", 1, 1)).toBe("c4 d4");
    expect(apply("r4 s4", "-\\accent")).toBe("r4 s4");
    expect(apply("c4", "(")).toBe("c4");
  });

  it("inserts tempo and structural markings around notes without replacing them", () => {
    expect(apply("{ c4 d4-\\accent }", "\\tempo 4 = 120")).toBe(
      "{ \\tempo 4 = 120 c4 d4-\\accent }",
    );
    expect(apply('{ c4 d4^\\markup \\italic "dolce" }', '\\bar "|."')).toBe(
      '{ c4 d4^\\markup \\italic "dolce" \\bar "|." }',
    );
    expect(apply("{ c4 d4-\\accent }", "\\repeat volta 2 { c4 d e f }")).toBe(
      "{ \\repeat volta 2 { c4 d4-\\accent } }",
    );
  });

  it("replaces expanded dynamics as one marking", () => {
    expect(apply("c4\\ppppp d4", "\\rfz")).toBe("c4\\rfz d4");
    expect(apply("c4\\sfp d4", "\\fffff")).toBe("c4\\fffff d4");
  });

  it("applies trills to individual notes and continuous trills to the endpoints", () => {
    expect(apply("c4 d4 e4 f4", "\\trill")).toBe(
      "c4\\trill d4\\trill e4\\trill f4\\trill",
    );
    expect(apply("c4 d4 e4 f4", "\\startTrillSpan")).toBe(
      "c4\\startTrillSpan d4 e4 f4\\stopTrillSpan",
    );
  });

  it("sets and updates single-note tremolos, preserving note durations and rests", () => {
    expect(apply("c4 d8. r16 <e g>2", ":32")).toBe(
      "c4:32 d8.:32 r16 <e g>2:32",
    );
    expect(apply("c4:8 d4:32", ":16")).toBe("c4:16 d4:16");
  });

  it("preserves the combined duration of two-note tremolos, including inherited and dotted rhythms", () => {
    const sixteenth = "\\repeat tremolo 4 { c16 e16 }";
    expect(apply("c4 e4", sixteenth)).toBe("\\repeat tremolo 4 { c16 e16 }");
    expect(apply("c4*2 e", sixteenth)).toBe("\\repeat tremolo 8 { c16 e16 }");
    expect(apply("<c e g>2 <d f a>", sixteenth)).toBe(
      "\\repeat tremolo 8 { <c e g>16 <d f a>16 }",
    );
    const dotted = "a8. b c";
    expect(apply(dotted, sixteenth, dotted.indexOf("b"))).toBe(
      "a8. \\repeat tremolo 3 { b16 c16 }",
    );
    const existing = "\\repeat tremolo 4 { c16 e16 }";
    expect(apply(existing, "\\repeat tremolo 8 { c32 e32 }")).toBe(
      "\\repeat tremolo 8 { c32 e32 }",
    );
  });

  it("does not create an alternating tremolo across rests or from three notes", () => {
    const code = "\\repeat tremolo 4 { c16 e16 }";
    expect(apply("c4 r4 e4", code)).toBe("c4 r4 e4");
    expect(apply("c4 d4 e4", code)).toBe("c4 d4 e4");
  });

  it("keeps unselected inherited rhythms unchanged and out of the tremolo selection", () => {
    const source = "c4 d e f";
    const notation = notations.find(
      (item) =>
        item.application === "tremoloPair" && item.tremoloDivision === 32,
    );
    const change = applyMusicNotation(source, 0, 4, notation);
    const updated =
      source.slice(0, change.start) + change.text + source.slice(change.end);
    expect(updated).toBe("\\repeat tremolo 8 { c32 d32 } e4 f");
    expect(updated.slice(change.selectionStart, change.selectionEnd)).toBe(
      "\\repeat tremolo 8 { c32 d32 }",
    );
    expect(apply("c8. d r e", notation.code, 0, 5)).toBe(
      "\\repeat tremolo 6 { c32 d32 } r8. e",
    );
  });
});
