import { stackNoteIntervals } from "./stackNoteIntervals";
import type { OffsetRange } from "./stackNoteIntervals";

function stack(
  source: string,
  interval: number,
  direction: 1 | -1 = 1,
  ranges: OffsetRange[] = [{ start: 0, end: source.length }],
) {
  const result = stackNoteIntervals(source, ranges, interval, direction);
  let updated = source;
  for (const edit of result.edits.toSorted((a, b) => b.start - a.start))
    updated =
      updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  return { ...result, source: updated };
}

describe("stacking note intervals", () => {
  it.each(["c'", "d'", "e'", "f'", "g'", "a'", "b'", "c''"])(
    "stacks ascending degree %# on a single note",
    (added) => {
      const interval =
        ["c'", "d'", "e'", "f'", "g'", "a'", "b'", "c''"].indexOf(added) + 1;
      expect(stack("c'4", interval).source).toBe(`<c' ${added}>4`);
    },
  );
  it.each(["c'", "b", "a", "g", "f", "e", "d", "c"])(
    "stacks descending degree %# on a single note",
    (added) => {
      const interval =
        ["c'", "b", "a", "g", "f", "e", "d", "c"].indexOf(added) + 1;
      expect(stack("c'4", interval, -1).source).toBe(`<c' ${added}>4`);
    },
  );

  it("uses the highest chord pitch in both directions, independent of source ordering", () => {
    expect(stack("<g c' e'>4", 3).source).toBe("<g c' e' g'>4");
    expect(stack("<c' e' g'>4", 4, -1).source).toBe("<c' e' g' d'>4");
    expect(stack("<c' e' g'>4", 3, -1).edits).toHaveLength(0);
  });

  it("uses relative chord octaves while keeping the first pitch and following notes unchanged", () => {
    expect(stack("\\relative c' { c4 d e f }", 3).source).toBe(
      "\\relative c' { <c e>4 <d f> <e g> <f a> }",
    );
    expect(stack("\\relative c' { <g c e>4 f4 }", 8).source).toBe(
      "\\relative c' { <g c e e'>4 <f f'>4 }",
    );
    expect(stack("\\relative c' { c4 d4 }", 8, -1).source).toBe(
      "\\relative c' { <c c,>4 <d d,>4 }",
    );
  });

  it("honors nested absolute and fixed entry inside relative music", () => {
    expect(stack("\\relative c' { c4 \\fixed c'' { c4 } d4 }", 8).source).toBe(
      "\\relative c' { <c c'>4 \\fixed c'' { <c c'>4 } <d d'>4 }",
    );
    expect(stack("\\relative c' { \\absolute { c'4 } c4 }", 3).source).toBe(
      "\\relative c' { \\absolute { <c' e'>4 } <c e>4 }",
    );
  });

  it("follows major, minor, and shared key signatures", () => {
    expect(stack("\\key g \\major c'4", 4).source).toBe(
      "\\key g \\major <c' fis'>4",
    );
    expect(stack("\\key f \\major g'4", 3).source).toBe(
      "\\key f \\major <g' bes'>4",
    );
    expect(
      stack(
        "global = { \\key d \\minor }\nmelody = \\relative c' { \\global g4 }",
        3,
      ).source,
    ).toBe(
      "global = { \\key d \\minor }\nmelody = \\relative c' { \\global <g bes>4 }",
    );
  });

  it("preserves accidentals on unisons and octaves and respects input language", () => {
    expect(stack("cis'4", 8).source).toBe("<cis' cis''>4");
    expect(stack('\\language "english" \\key g \\major c4', 4).source).toBe(
      '\\language "english" \\key g \\major <c fs>4',
    );
    expect(stack('\\language "deutsch" \\key f \\major g4', 3).source).toBe(
      '\\language "deutsch" \\key f \\major <g b>4',
    );
  });

  it("preserves rhythm, tremolos, rests, comments, and attached markings", () => {
    const source = "c'!8.*3/2-\\accent r16 <e' g'>2:32\\fermata % a4\n";
    expect(stack(source, 3).source).toBe(
      "<c'! e'>8.*3/2-\\accent r16 <e' g' b'>2:32\\fermata % a4\n",
    );
    expect(stack("<c' e' g' % chord\n >4", 3).source).toBe(
      "<c' e' g' % chord\n b'>4",
    );
  });

  it("changes only the selected events and retains their expanded selection", () => {
    const source = "c4 d4 e4";
    const result = stack(source, 3, 1, [
      { start: 0, end: 1 },
      { start: 6, end: 7 },
    ]);
    expect(result.source).toBe("<c e>4 d4 <e g>4");
    expect(
      result.selections.map((selection) =>
        result.source.slice(selection.start, selection.end),
      ),
    ).toEqual(["<c e>4", "<e g>4"]);
  });

  it("materializes repeated chords without modifying unselected repetitions", () => {
    expect(stack("<c e g>4 q4", 3, 1, [{ start: 0, end: 8 }]).source).toBe(
      "<c e g b>4 \\fixed c { <c e g>4 }",
    );
    expect(stack("<c e g>4 q4", 3).source).toBe(
      "<c e g b>4 \\fixed c { <c e g b>4 }",
    );
    expect(stack("<c e g>4 d4 q4", 3, 1, [{ start: 9, end: 10 }]).source).toBe(
      "<c e g>4 <d f>4 \\fixed c { <c e g>4 }",
    );
  });

  it("preserves repeated-chord octaves, markings, and following relative pitches", () => {
    const source = "\\relative c' { <c e g>4 d'4 q4-\\staccato e4 }";
    const start = source.indexOf("q4");
    const result = stack(source, 3, 1, [{ start, end: start + 2 }]);
    expect(result.source).toBe(
      "\\relative c' { <c e g>4 d'4 \\fixed c { <c' e' g' b'>4-\\staccato } e4 }",
    );
    expect(
      result.source.slice(result.selections[0].start, result.selections[0].end),
    ).toBe("\\fixed c { <c' e' g' b'>4-\\staccato }");
  });

  it("ignores non-musical text and rests at the cursor", () => {
    const source =
      '\\header { title = "c4 d4" } % e4\n\\key c \\major\n\\relative c\' { r4 s4 }';
    expect(stack(source, 3).edits).toHaveLength(0);
    expect(stack("r4", 3, 1, [{ start: 1, end: 1 }]).edits).toHaveLength(0);
  });

  it.each([0, 1, 2])(
    "stacks the current note at cursor offset %i without requiring a text selection",
    (offset) => {
      const result = stack("c4 d4", 3, 1, [{ start: offset, end: offset }]);
      expect(result.source).toBe("<c e>4 d4");
      expect(
        result.source.slice(
          result.selections[0].start,
          result.selections[0].end,
        ),
      ).toBe("<c e>4");
    },
  );

  it("uses the whole chord at the cursor, including its markings", () => {
    expect(
      stack("<c e g>4-\\accent d4", 8, 1, [{ start: 4, end: 4 }]).source,
    ).toBe("<c e g g'>4-\\accent d4");
    expect(stack("c4-\\accent d4", 3, 1, [{ start: 10, end: 10 }]).source).toBe(
      "<c e>4-\\accent d4",
    );
  });
});
