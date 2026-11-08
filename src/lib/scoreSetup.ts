export const INSTRUMENT_FAMILIES = [
  { id: "woodwinds", label: "Woodwinds" },
  { id: "brass", label: "Brass" },
  { id: "percussion", label: "Percussion" },
  { id: "plucked", label: "Plucked strings" },
  { id: "keyboards", label: "Keyboards" },
  { id: "strings", label: "Strings" },
] as const;

export type InstrumentFamily = (typeof INSTRUMENT_FAMILIES)[number]["id"];
export interface InstrumentDefinition {
  id: string;
  name: string;
  shortName: string;
  family: InstrumentFamily;
  clefs: string[];
  midi?: string;
  soundingPitch?: string;
  drum?: boolean;
}

// Catalog order follows the conventional orchestral score from top to bottom.
export const INSTRUMENTS: InstrumentDefinition[] = [
  {
    id: "piccolo",
    name: "Piccolo",
    shortName: "Picc.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "piccolo",
    soundingPitch: "c''",
  },
  {
    id: "flute",
    name: "Flute",
    shortName: "Fl.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "flute",
  },
  {
    id: "oboe",
    name: "Oboe",
    shortName: "Ob.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "oboe",
  },
  {
    id: "english-horn",
    name: "English horn in F",
    shortName: "E. hn.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "english horn",
    soundingPitch: "f",
  },
  {
    id: "clarinet-bb",
    name: "Clarinet in B♭",
    shortName: "Cl.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "clarinet",
    soundingPitch: "bes",
  },
  {
    id: "clarinet-a",
    name: "Clarinet in A",
    shortName: "Cl. A",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "clarinet",
    soundingPitch: "a",
  },
  {
    id: "bass-clarinet",
    name: "Bass clarinet in B♭",
    shortName: "B. cl.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "clarinet",
    soundingPitch: "bes,",
  },
  {
    id: "alto-sax",
    name: "Alto saxophone in E♭",
    shortName: "A. sax.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "alto sax",
    soundingPitch: "ees",
  },
  {
    id: "tenor-sax",
    name: "Tenor saxophone in B♭",
    shortName: "T. sax.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "tenor sax",
    soundingPitch: "bes,",
  },
  {
    id: "baritone-sax",
    name: "Baritone saxophone in E♭",
    shortName: "Bar. sax.",
    family: "woodwinds",
    clefs: ["treble"],
    midi: "baritone sax",
    soundingPitch: "ees,",
  },
  {
    id: "bassoon",
    name: "Bassoon",
    shortName: "Bsn.",
    family: "woodwinds",
    clefs: ["bass"],
    midi: "bassoon",
  },
  {
    id: "contrabassoon",
    name: "Contrabassoon",
    shortName: "Cbsn.",
    family: "woodwinds",
    clefs: ["bass"],
    midi: "bassoon",
    soundingPitch: "c",
  },
  {
    id: "horn-f",
    name: "Horn in F",
    shortName: "Hn.",
    family: "brass",
    clefs: ["treble"],
    midi: "french horn",
    soundingPitch: "f",
  },
  {
    id: "trumpet-bb",
    name: "Trumpet in B♭",
    shortName: "Tpt.",
    family: "brass",
    clefs: ["treble"],
    midi: "trumpet",
    soundingPitch: "bes",
  },
  {
    id: "trumpet-c",
    name: "Trumpet in C",
    shortName: "Tpt. C",
    family: "brass",
    clefs: ["treble"],
    midi: "trumpet",
  },
  {
    id: "trombone",
    name: "Trombone",
    shortName: "Tbn.",
    family: "brass",
    clefs: ["bass"],
    midi: "trombone",
  },
  {
    id: "bass-trombone",
    name: "Bass trombone",
    shortName: "B. tbn.",
    family: "brass",
    clefs: ["bass"],
    midi: "trombone",
  },
  {
    id: "tuba",
    name: "Tuba",
    shortName: "Tba.",
    family: "brass",
    clefs: ["bass"],
    midi: "tuba",
  },
  {
    id: "timpani",
    name: "Timpani",
    shortName: "Timp.",
    family: "percussion",
    clefs: ["bass"],
    midi: "timpani",
  },
  {
    id: "glockenspiel",
    name: "Glockenspiel",
    shortName: "Glock.",
    family: "percussion",
    clefs: ["treble"],
    midi: "glockenspiel",
    soundingPitch: "c'''",
  },
  {
    id: "xylophone",
    name: "Xylophone",
    shortName: "Xyl.",
    family: "percussion",
    clefs: ["treble"],
    midi: "xylophone",
    soundingPitch: "c''",
  },
  {
    id: "vibraphone",
    name: "Vibraphone",
    shortName: "Vib.",
    family: "percussion",
    clefs: ["treble"],
    midi: "vibraphone",
  },
  {
    id: "marimba",
    name: "Marimba",
    shortName: "Mar.",
    family: "percussion",
    clefs: ["treble", "bass"],
    midi: "marimba",
  },
  {
    id: "snare-drum",
    name: "Snare drum",
    shortName: "Sn. dr.",
    family: "percussion",
    clefs: ["percussion"],
    drum: true,
  },
  {
    id: "bass-drum",
    name: "Bass drum",
    shortName: "B. dr.",
    family: "percussion",
    clefs: ["percussion"],
    drum: true,
  },
  {
    id: "cymbals",
    name: "Cymbals",
    shortName: "Cym.",
    family: "percussion",
    clefs: ["percussion"],
    drum: true,
  },
  {
    id: "triangle",
    name: "Triangle",
    shortName: "Tri.",
    family: "percussion",
    clefs: ["percussion"],
    drum: true,
  },
  {
    id: "harp",
    name: "Harp",
    shortName: "Hp.",
    family: "plucked",
    clefs: ["treble", "bass"],
    midi: "orchestral harp",
  },
  {
    id: "guitar",
    name: "Guitar",
    shortName: "Gtr.",
    family: "plucked",
    clefs: ["treble"],
    midi: "acoustic guitar (nylon)",
    soundingPitch: "c",
  },
  {
    id: "piano",
    name: "Piano",
    shortName: "Pno.",
    family: "keyboards",
    clefs: ["treble", "bass"],
    midi: "acoustic grand",
  },
  {
    id: "celesta",
    name: "Celesta",
    shortName: "Cel.",
    family: "keyboards",
    clefs: ["treble", "bass"],
    midi: "celesta",
    soundingPitch: "c''",
  },
  {
    id: "organ",
    name: "Organ",
    shortName: "Org.",
    family: "keyboards",
    clefs: ["treble", "bass", "bass"],
    midi: "church organ",
  },
  {
    id: "violin",
    name: "Violin",
    shortName: "Vln.",
    family: "strings",
    clefs: ["treble"],
    midi: "violin",
  },
  {
    id: "viola",
    name: "Viola",
    shortName: "Vla.",
    family: "strings",
    clefs: ["alto"],
    midi: "viola",
  },
  {
    id: "cello",
    name: "Cello",
    shortName: "Vc.",
    family: "strings",
    clefs: ["bass"],
    midi: "cello",
  },
  {
    id: "double-bass",
    name: "Double bass",
    shortName: "Cb.",
    family: "strings",
    clefs: ["bass"],
    midi: "contrabass",
    soundingPitch: "c",
  },
];

export interface ScorePart {
  id: string;
  instrumentId: string;
  name: string;
}
export type KeyMode = "major" | "minor";
export type ScorePitch = "written" | "concert";
export const KEY_SIGNATURES = [
  {
    fifths: -7,
    major: "C♭",
    minor: "A♭",
    majorPitch: "ces",
    minorPitch: "aes",
  },
  {
    fifths: -6,
    major: "G♭",
    minor: "E♭",
    majorPitch: "ges",
    minorPitch: "ees",
  },
  {
    fifths: -5,
    major: "D♭",
    minor: "B♭",
    majorPitch: "des",
    minorPitch: "bes",
  },
  { fifths: -4, major: "A♭", minor: "F", majorPitch: "aes", minorPitch: "f" },
  { fifths: -3, major: "E♭", minor: "C", majorPitch: "ees", minorPitch: "c" },
  { fifths: -2, major: "B♭", minor: "G", majorPitch: "bes", minorPitch: "g" },
  { fifths: -1, major: "F", minor: "D", majorPitch: "f", minorPitch: "d" },
  { fifths: 0, major: "C", minor: "A", majorPitch: "c", minorPitch: "a" },
  { fifths: 1, major: "G", minor: "E", majorPitch: "g", minorPitch: "e" },
  { fifths: 2, major: "D", minor: "B", majorPitch: "d", minorPitch: "b" },
  { fifths: 3, major: "A", minor: "F♯", majorPitch: "a", minorPitch: "fis" },
  { fifths: 4, major: "E", minor: "C♯", majorPitch: "e", minorPitch: "cis" },
  { fifths: 5, major: "B", minor: "G♯", majorPitch: "b", minorPitch: "gis" },
  { fifths: 6, major: "F♯", minor: "D♯", majorPitch: "fis", minorPitch: "dis" },
  { fifths: 7, major: "C♯", minor: "A♯", majorPitch: "cis", minorPitch: "ais" },
];
export const TEMPO_BEATS = [
  { value: "4", label: "Quarter note" },
  { value: "4.", label: "Dotted quarter" },
  { value: "2", label: "Half note" },
  { value: "2.", label: "Dotted half" },
  { value: "8", label: "Eighth note" },
  { value: "8.", label: "Dotted eighth" },
];
function presetParts(...instruments: string[]): Omit<ScorePart, "id">[] {
  return instruments.map((instrumentId) => ({ instrumentId, name: "" }));
}
const VIOLIN_SECTIONS = [
  { instrumentId: "violin", name: "Violin I" },
  { instrumentId: "violin", name: "Violin II" },
];
export const SCORE_PRESETS = [
  { name: "Piano solo", parts: presetParts("piano") },
  {
    name: "String quartet",
    parts: [...VIOLIN_SECTIONS, ...presetParts("viola", "cello")],
  },
  {
    name: "Orchestra",
    parts: [
      ...presetParts(
        "piccolo",
        "flute",
        "flute",
        "oboe",
        "oboe",
        "clarinet-bb",
        "clarinet-bb",
        "bassoon",
        "bassoon",
        "horn-f",
        "horn-f",
        "horn-f",
        "horn-f",
        "trumpet-bb",
        "trumpet-bb",
        "trombone",
        "trombone",
        "bass-trombone",
        "tuba",
        "timpani",
      ),
      ...VIOLIN_SECTIONS,
      ...presetParts("viola", "cello", "double-bass"),
    ],
  },
];

export interface ScoreSetup {
  parts: ScorePart[];
  keyFifths: number;
  keyMode: KeyMode;
  numerator: number;
  denominator: number;
  tempo: number;
  tempoBeat: string;
  tempoText: string;
  bars: number;
  pitch: ScorePitch;
  title: string;
  composer: string;
}
export const DEFAULT_SCORE_SETTINGS: Omit<ScoreSetup, "parts"> = {
  keyFifths: 0,
  keyMode: "major",
  numerator: 4,
  denominator: 4,
  tempo: 120,
  tempoBeat: "4",
  tempoText: "",
  bars: 8,
  pitch: "written",
  title: "Untitled",
  composer: "",
};

export function instrumentFor(part: ScorePart): InstrumentDefinition {
  const instrument = INSTRUMENTS.find(
    (entry) => entry.id === part.instrumentId,
  );
  if (!instrument) throw new Error("Unknown instrument");
  return instrument;
}
export function orchestralOrder(parts: ScorePart[]): ScorePart[] {
  return [...parts].sort(
    (a, b) =>
      INSTRUMENTS.findIndex((entry) => entry.id === a.instrumentId) -
      INSTRUMENTS.findIndex((entry) => entry.id === b.instrumentId),
  );
}
export function partName(
  part: ScorePart,
  parts: ScorePart[],
  short = false,
): string {
  if (part.name.trim()) return part.name.trim();
  const instrument = instrumentFor(part);
  const same = parts.filter(
    (entry) => entry.instrumentId === part.instrumentId,
  );
  const suffix =
    same.length > 1
      ? ` ${same.findIndex((entry) => entry.id === part.id) + 1}`
      : "";
  return `${short ? instrument.shortName : instrument.name}${suffix}`;
}
export function scoreSetupError(setup: ScoreSetup): string | null {
  if (setup.parts.length < 1 || setup.parts.length > 64)
    return "Choose between 1 and 64 instrument parts.";
  if (
    setup.parts.some(
      (part) =>
        !INSTRUMENTS.some((instrument) => instrument.id === part.instrumentId),
    )
  )
    return "Choose a valid instrument for every part.";
  if (new Set(setup.parts.map((part) => part.id)).size !== setup.parts.length)
    return "Each part must have a unique ID.";
  if (
    !KEY_SIGNATURES.some((key) => key.fifths === setup.keyFifths) ||
    !["major", "minor"].includes(setup.keyMode)
  )
    return "Choose a valid key signature.";
  if (
    !Number.isInteger(setup.numerator) ||
    setup.numerator < 1 ||
    setup.numerator > 32 ||
    ![1, 2, 4, 8, 16, 32].includes(setup.denominator)
  )
    return "Use a time signature with 1–32 beats and a valid note value.";
  if (
    !Number.isInteger(setup.tempo) ||
    setup.tempo < 20 ||
    setup.tempo > 400 ||
    !TEMPO_BEATS.some((beat) => beat.value === setup.tempoBeat)
  )
    return "Choose a tempo from 20 to 400 BPM and a beat unit.";
  if (!Number.isInteger(setup.bars) || setup.bars < 1 || setup.bars > 128)
    return "Choose between 1 and 128 starting bars.";
  if (!["written", "concert"].includes(setup.pitch))
    return "Choose written or concert pitch.";
  return null;
}

function quoted(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, " ")}"`;
}
function letters(index: number): string {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}
function indent(source: string, spaces: number): string {
  return source
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : ""))
    .join("\n");
}

export function createScoreSource(setup: ScoreSetup): string {
  const error = scoreSetupError(setup);
  if (error) throw new Error(error);
  const key = KEY_SIGNATURES.find((entry) => entry.fifths === setup.keyFifths);
  const keyCommand = `\\key ${setup.keyMode === "major" ? key.majorPitch : key.minorPitch} \\${setup.keyMode}`;
  const variables: string[] = [];
  const sections: { family: InstrumentFamily; staves: string[] }[] = [];
  let staffCount = 0;
  setup.parts.forEach((part, partIndex) => {
    const instrument = instrumentFor(part);
    const partId = `part${letters(partIndex)}`;
    const written = setup.pitch === "written" && !!instrument.soundingPitch;
    const keyLine = instrument.drum
      ? ""
      : written
        ? `\\transpose ${instrument.soundingPitch} c' { ${keyCommand} }`
        : keyCommand;
    const staffMusic = instrument.clefs.map((clef, staffIndex) => {
      staffCount++;
      const musicId = `${partId}${letters(staffIndex)}Music`;
      const tempo =
        partIndex === 0 && staffIndex === 0
          ? `  \\tempo ${setup.tempoText.trim() ? `${quoted(setup.tempoText.trim())} ` : ""}${setup.tempoBeat} = ${setup.tempo}\n`
          : "";
      variables.push(
        `% ${partName(part, setup.parts).replace(/[\r\n]/g, " ")}${instrument.clefs.length > 1 ? ` — staff ${staffIndex + 1}` : ""}\n${musicId} = ${instrument.drum ? "\\drummode" : `\\relative ${clef === "bass" ? "c" : "c'"}`} {\n  \\global\n${keyLine ? `  ${keyLine}\n` : ""}${tempo}  % Replace these rests with your music.\n  \\repeat unfold ${setup.bars} { R1*${setup.numerator}/${setup.denominator} }\n}`,
      );
      return `\\new ${instrument.drum ? "DrumStaff" : "Staff"} = "${partId}${letters(staffIndex)}"${instrument.clefs.length === 1 ? ` \\with {\n  instrumentName = ${quoted(partName(part, setup.parts))}\n  shortInstrumentName = ${quoted(partName(part, setup.parts, true))}${instrument.midi ? `\n  midiInstrument = ${quoted(instrument.midi)}` : ""}\n}` : instrument.midi ? ` \\with { midiInstrument = ${quoted(instrument.midi)} }` : ""} {\n  \\clef ${quoted(clef)}\n${written ? `  \\transposition ${instrument.soundingPitch}\n` : ""}  \\${musicId}\n}`;
    });
    const staves =
      instrument.clefs.length > 1
        ? `\\new PianoStaff = "${partId}" \\with {\n  instrumentName = ${quoted(partName(part, setup.parts))}\n  shortInstrumentName = ${quoted(partName(part, setup.parts, true))}\n} <<\n${indent(staffMusic.join("\n"), 2)}\n>>`
        : staffMusic[0];
    let section = sections.at(-1);
    if (!section || section.family !== instrument.family) {
      section = { family: instrument.family, staves: [] };
      sections.push(section);
    }
    section.staves.push(staves);
  });
  const groups = sections.map((section, index) =>
    section.staves.length > 1
      ? `\\new StaffGroup = "section${letters(index)}" <<\n${indent(section.staves.join("\n\n"), 2)}\n>>`
      : section.staves[0],
  );
  return `\\version "2.26.0"\n\\language "nederlands"\n\n#(set-global-staff-size ${staffCount > 20 ? 14 : staffCount > 10 ? 16 : 18})\n\n\\header {\n  title = ${quoted(setup.title.trim() || "Untitled")}\n  composer = ${quoted(setup.composer.trim())}\n}\n\nglobal = {\n  \\numericTimeSignature\n  \\time ${setup.numerator}/${setup.denominator}\n}\n\n% ${setup.pitch === "written" ? "Enter written pitches; transposing instruments have adjusted keys and MIDI transposition." : "Enter concert pitches for every instrument."}\n${variables.join("\n\n")}\n\n\\score {\n  <<\n${indent(groups.join("\n\n"), 4)}\n  >>\n  \\layout { indent = 32\\mm short-indent = 14\\mm }\n  \\midi {\n    \\context {\n      \\Score\n      midiChannelMapping = #'instrument\n    }\n  }\n}\n`;
}
