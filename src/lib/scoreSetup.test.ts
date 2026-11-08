import {
  DEFAULT_SCORE_SETTINGS,
  INSTRUMENTS,
  SCORE_PRESETS,
  createScoreSource,
  orchestralOrder,
  partName,
} from "./scoreSetup";
import type { ScorePart } from "./scoreSetup";

function part(instrumentId: string, id = instrumentId, name = ""): ScorePart {
  return { id, instrumentId, name };
}

describe("score setup", () => {
  it("orders instrument families and registers violin once with separate score parts", () => {
    const selected = [
      part("cello"),
      part("horn-f"),
      part("flute"),
      part("violin", "first"),
      part("violin", "second"),
    ];
    const ordered = orchestralOrder(selected);
    expect(ordered.map((entry) => entry.id)).toEqual([
      "flute",
      "horn-f",
      "first",
      "second",
      "cello",
    ]);
    expect(selected[0].instrumentId).toBe("cello");
    expect(
      INSTRUMENTS.filter((instrument) => instrument.midi === "violin"),
    ).toHaveLength(1);
    expect(partName(ordered[2], ordered)).toBe("Violin 1");
    expect(partName(ordered[3], ordered)).toBe("Violin 2");
    for (const preset of SCORE_PRESETS.filter(
      (entry) => entry.name !== "Piano solo",
    )) {
      expect(
        preset.parts
          .filter((entry) => entry.instrumentId === "violin")
          .map((entry) => entry.name),
      ).toEqual(["Violin I", "Violin II"]);
    }
  });

  it("creates grouped piano staves, an alto-clef viola, and separate unpitched percussion", () => {
    const source = createScoreSource({
      ...DEFAULT_SCORE_SETTINGS,
      parts: [part("piano"), part("viola"), part("snare-drum")],
      numerator: 6,
      denominator: 8,
      tempo: 84,
      tempoBeat: "4.",
      bars: 12,
    });
    expect(source).toContain('\\new PianoStaff = "partA"');
    expect(source).toContain('\\clef "alto"');
    expect(source).toContain('\\new DrumStaff = "partCA"');
    expect(source).toContain(
      "partCAMusic = \\drummode {\n  \\global\n  % Replace",
    );
    expect(source).toContain("\\time 6/8");
    expect(source).toContain("\\repeat unfold 12 { R1*6/8 }");
    expect(source.match(/\\tempo /g)).toHaveLength(1);
    expect(source).toContain("\\tempo 4. = 84");
    expect(source).toContain("midiChannelMapping = #'instrument");
  });

  it("adjusts written keys and sounding pitch without transposing user-entered notes", () => {
    const setup = {
      ...DEFAULT_SCORE_SETTINGS,
      parts: [part("clarinet-bb"), part("horn-f")],
    };
    const written = createScoreSource(setup);
    expect(written).toContain("\\transpose bes c' { \\key c \\major }");
    expect(written).toContain("\\transpose f c' { \\key c \\major }");
    expect(written).toContain("\\transposition bes");
    expect(written).toContain("\\transposition f");
    expect(written).not.toContain("\\transpose bes c' \\part");
    const concert = createScoreSource({ ...setup, pitch: "concert" });
    expect(concert).not.toContain("\\transpose");
    expect(concert).not.toContain("\\transposition");
    expect(concert.match(/\\key c \\major/g)).toHaveLength(2);
  });

  it("uses minor tonics, preserves custom order, and escapes metadata as strings", () => {
    const source = createScoreSource({
      ...DEFAULT_SCORE_SETTINGS,
      parts: [part("violin"), part("flute")],
      keyFifths: -3,
      keyMode: "minor",
      title: 'A "Suite" \\ draft\nnext',
      composer: 'Composer "C"',
    });
    expect(source).toContain("\\key c \\minor");
    expect(source).toContain('title = "A \\"Suite\\" \\\\ draft next"');
    expect(source).toContain('composer = "Composer \\"C\\""');
    expect(source.indexOf('instrumentName = "Violin"')).toBeLessThan(
      source.indexOf('instrumentName = "Flute"'),
    );
  });

  it("generates unique valid music identifiers beyond 26 parts", () => {
    const source = createScoreSource({
      ...DEFAULT_SCORE_SETTINGS,
      parts: Array.from({ length: 28 }, (_, index) =>
        part("flute", String(index)),
      ),
    });
    expect(source).toContain("partAAAMusic =");
    expect(source).toContain("partABAMusic =");
    expect(source.match(/^part[A-Z]+Music =/gm)).toHaveLength(28);
  });

  it.each([
    { parts: [] },
    { parts: [part("unknown")] },
    { numerator: 0 },
    { numerator: 3.5 },
    { denominator: 3 },
    { tempo: 0 },
    { tempo: 401 },
    { tempoBeat: "bad" },
    { bars: 0 },
    { bars: 129 },
    { keyFifths: 8 },
    { parts: [part("flute", "same"), part("oboe", "same")] },
  ])("rejects an invalid score setup: %j", (invalid) => {
    expect(() =>
      createScoreSource({
        ...DEFAULT_SCORE_SETTINGS,
        parts: [part("piano")],
        ...invalid,
      }),
    ).toThrow();
  });
});
