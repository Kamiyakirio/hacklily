export interface MusicNotation {
  label: string;
  code: string;
  example: string;
  glyph?: string;
  symbol?: string;
  application:
    | "each"
    | "first"
    | "last"
    | "between"
    | "span"
    | "before"
    | "after"
    | "wrap"
    | "tremolo"
    | "tremoloPair";
  tremoloDivision?: number;
  endCode?: string;
  selectionCode?: string;
  selectionLabel?: string;
}

function script(
  name: string,
  label: string,
  glyph: string,
  dash = false,
): MusicNotation {
  const code = `${dash ? "-" : ""}\\${name}`;
  return {
    label,
    code,
    glyph,
    application: "each",
    example: `c4${code} d e f`,
  };
}

function textMark(label: string, text: string): MusicNotation {
  const code = `^\\markup \\italic "${text}"`;
  return {
    label,
    code,
    symbol: text,
    application: "first",
    example: `c4${code} d e f`,
  };
}

function span(
  label: string,
  code: string,
  endCode: string,
  symbol: string,
): MusicNotation {
  return {
    label,
    code,
    endCode,
    symbol,
    application: "span",
    example: `c4${code} d e f${endCode}`,
  };
}

const DYNAMICS: [string, string, string][] = [
  ["ppppp", "Pianississississimo", "\uE528"],
  ["pppp", "Pianissississimo", "\uE529"],
  ["ppp", "Pianississimo", "\uE52A"],
  ["pp", "Pianissimo", "\uE52B"],
  ["p", "Piano", "\uE520"],
  ["mp", "Mezzo-piano", "\uE52C"],
  ["mf", "Mezzo-forte", "\uE52D"],
  ["f", "Forte", "\uE522"],
  ["ff", "Fortissimo", "\uE52F"],
  ["fff", "Fortississimo", "\uE530"],
  ["ffff", "Fortissississimo", "\uE531"],
  ["fffff", "Fortississississimo", "\uE532"],
  ["fp", "Forte-piano", "\uE534"],
  ["sf", "Sforzando", "\uE536"],
  ["sfp", "Sforzando-piano", "\uE537"],
  ["sff", "Sforzando fortissimo", "\uE524\uE52F"],
  ["sfz", "Sforzato", "\uE539"],
  ["fz", "Forzando", "\uE535"],
  ["sp", "Subito piano", "\uE524\uE520"],
  ["spp", "Subito pianissimo", "\uE524\uE52B"],
  ["rfz", "Rinforzando", "\uE53D"],
  ["n", "Niente", "\uE526"],
];

export const DYNAMIC_CODES = DYNAMICS.map(([name]) => `\\${name}`);

export const MUSIC_NOTATION_GROUPS: {
  label: string;
  items: MusicNotation[];
}[] = [
  {
    label: "Dynamics",
    items: [
      ...DYNAMICS.map(([name, label, glyph]): MusicNotation => ({
        label,
        code: `\\${name}`,
        glyph,
        application: "first",
        example: `c4\\${name} d e f`,
      })),
      {
        ...span("Start crescendo", "\\<", "\\!", "〈"),
        selectionLabel: "Crescendo",
      },
      {
        ...span("Start diminuendo", "\\>", "\\!", "〉"),
        selectionLabel: "Diminuendo",
      },
      span("Crescendo text", "\\cresc", "\\!", "cresc."),
      span("Diminuendo text", "\\dim", "\\!", "dim."),
      {
        label: "End hairpin",
        code: "\\!",
        symbol: "!",
        application: "last",
        example: "c4\\< d e f\\!",
      },
    ],
  },
  {
    label: "Articulations",
    items: [
      script("staccato", "Staccato", "\uE4A2", true),
      script("accent", "Accent", "\uE4A0", true),
      script("tenuto", "Tenuto", "\uE4A4", true),
      script("marcato", "Marcato", "\uE4AC", true),
      script("staccatissimo", "Staccatissimo", "\uE4A6", true),
      script("portato", "Portato", "\uE4B2", true),
      script("espressivo", "Espressivo", "\uE540"),
    ],
  },
  {
    label: "Pauses",
    items: [
      script("fermata", "Fermata", "\uE4C0"),
      script("veryshortfermata", "Very short fermata", "\uE4C2"),
      script("shortfermata", "Short fermata", "\uE4C4"),
      script("longfermata", "Long fermata", "\uE4C6"),
      script("verylongfermata", "Very long fermata", "\uE4C8"),
      script("henzeshortfermata", "Henze short fermata", "\uE4CC"),
      script("henzelongfermata", "Henze long fermata", "\uE4CA"),
      {
        label: "Breath mark",
        code: "\\breathe",
        glyph: "\uE4CE",
        application: "after",
        example: "c4 d \\breathe e f",
      },
      {
        label: "Caesura",
        code: "\\caesura",
        glyph: "\uE4D1",
        application: "after",
        example: "c4 d \\caesura e f",
      },
    ],
  },
  {
    label: "Ornaments",
    items: [
      script("trill", "Trill", "\uE566"),
      script("mordent", "Mordent", "\uE56C"),
      script("prall", "Inverted mordent", "\uE56D"),
      script("turn", "Turn", "\uE567"),
      script("reverseturn", "Inverted turn", "\uE568"),
      script("slashturn", "Slashed turn", "\uE569"),
      script("haydnturn", "Haydn turn", "\uE56F"),
      script("prallprall", "Double trill", "\uE56E"),
      script("prallmordent", "Trill with mordent", "\uE5BD"),
      script("bachschleifer", "Bach slide", "\uE5B8"),
      {
        ...script("arpeggio", "Arpeggio", "\uE634"),
        example: "<c e g>1\\arpeggio",
      },
      {
        ...span(
          "Trill extension",
          "\\startTrillSpan",
          "\\stopTrillSpan",
          "tr…",
        ),
        glyph: "\uE566",
      },
      {
        label: "End trill extension",
        code: "\\stopTrillSpan",
        symbol: "tr end",
        application: "last",
        example: "c4\\startTrillSpan d e f\\stopTrillSpan",
      },
    ],
  },
  {
    label: "Tremolos",
    items: [
      ...[8, 16, 32, 64].map((division, index): MusicNotation => ({
        label: `Single-note tremolo (1/${division})`,
        code: `:${division}`,
        glyph: String.fromCodePoint(0xe220 + index),
        application: "tremolo",
        tremoloDivision: division,
        example: `c4:${division} d4:${division}`,
      })),
      ...[8, 16, 32, 64].map((division, index): MusicNotation => ({
        label: `Two-note tremolo (1/${division})`,
        code: `\\repeat tremolo ${division / 4} { c${division} e${division} }`,
        glyph: String.fromCodePoint(0xe220 + index),
        application: "tremoloPair",
        tremoloDivision: division,
        example: `\\repeat tremolo ${division / 4} { c${division} e${division} }`,
      })),
    ],
  },
  {
    label: "Slurs, ties & beams",
    items: [
      { ...span("Start slur", "(", ")", "⌒"), selectionLabel: "Slur" },
      {
        label: "End slur",
        code: ")",
        symbol: "⌒",
        application: "last",
        example: "c4( d e f)",
      },
      span("Phrasing slur", "\\(", "\\)", "⌒"),
      {
        label: "End phrasing slur",
        code: "\\)",
        symbol: "⌒ end",
        application: "last",
        example: "c4\\( d e f\\)",
      },
      {
        label: "Tie",
        code: "~",
        symbol: "~",
        application: "between",
        example: "c2~ c2",
      },
      { ...script("laissezVibrer", "Let ring", "\uE4BA"), application: "last" },
      { ...script("repeatTie", "Repeat tie", "\uE4BB"), application: "first" },
      {
        ...span("Start beam", "[", "]", "["),
        selectionLabel: "Beam",
        example: "c8[ d e f] g2",
      },
      {
        label: "End beam",
        code: "]",
        symbol: "]",
        application: "last",
        example: "c8[ d e f] g2",
      },
      {
        label: "Glissando",
        code: "\\glissando",
        symbol: "gliss.",
        application: "between",
        example: "c4\\glissando g4",
      },
    ],
  },
  {
    label: "Techniques",
    items: [
      script("upbow", "Up bow", "\uE612"),
      script("downbow", "Down bow", "\uE610"),
      script("flageolet", "Harmonic", "\uE614"),
      script("open", "Open string / open tone", "\uE614"),
      {
        label: "Half-open tone",
        code: "\\halfopen",
        symbol: "ø",
        application: "each",
        example: "c4\\halfopen d e f",
      },
      {
        label: "Stopped tone",
        code: "\\stopped",
        symbol: "+",
        application: "each",
        example: "c4\\stopped d e f",
      },
      script("snappizzicato", "Snap pizzicato", "\uE631"),
      script("thumb", "Thumb position", "\uE624"),
      textMark("Pizzicato", "pizz."),
      textMark("Arco", "arco"),
      textMark("Con sordino", "con sord."),
      textMark("Senza sordino", "senza sord."),
      textMark("Sul ponticello", "sul pont."),
      textMark("Sul tasto", "sul tasto"),
      textMark("Col legno", "col legno"),
      textMark("Ordinario", "ord."),
      textMark("Vibrato", "vibrato"),
      textMark("Non vibrato", "non vibr."),
    ],
  },
  {
    label: "Fingering",
    items: [
      ...[0, 1, 2, 3, 4, 5].map((finger): MusicNotation => ({
        label: finger === 0 ? "Open fingering" : `Finger ${finger}`,
        code: `-${finger}`,
        symbol: String(finger),
        application: "each",
        example: `c4-${finger} d e f`,
      })),
      ...["p", "i", "m", "a", "c"].map((finger, index): MusicNotation => ({
        label: `Right-hand finger ${finger}`,
        code: `-\\rightHandFinger #${index + 1}`,
        symbol: finger,
        application: "each",
        example: `c4-\\rightHandFinger #${index + 1} d e f`,
      })),
      ...[1, 2, 3, 4, 5, 6].map((string): MusicNotation => ({
        label: `String ${string}`,
        code: `\\${string}`,
        symbol: String(string),
        application: "each",
        example: `c4\\${string} d e f`,
      })),
    ],
  },
  {
    label: "Pedals",
    items: [
      {
        ...span("Sustain pedal", "\\sustainOn", "\\sustainOff", "Ped."),
        glyph: "\uE650",
      },
      {
        label: "Release sustain pedal",
        code: "\\sustainOff",
        glyph: "\uE655",
        application: "last",
        example: "c4\\sustainOn d e f\\sustainOff",
      },
      {
        ...span("Sostenuto pedal", "\\sostenutoOn", "\\sostenutoOff", "Sost."),
        glyph: "\uE659",
      },
      {
        label: "Release sostenuto pedal",
        code: "\\sostenutoOff",
        symbol: "Sost. off",
        application: "last",
        example: "c4\\sostenutoOn d e f\\sostenutoOff",
      },
      span("Una corda", "\\unaCorda", "\\treCorde", "u.c."),
      {
        label: "Tre corde",
        code: "\\treCorde",
        symbol: "t.c.",
        application: "last",
        example: "c4\\unaCorda d e f\\treCorde",
      },
    ],
  },
  {
    label: "Tempo & expression",
    items: [
      {
        label: "Metronome mark",
        code: "\\tempo 4 = 120",
        symbol: "♩=120",
        application: "before",
        example: "\\tempo 4 = 120 c4 d e f",
      },
      ...(
        [
          ["Largo", 48],
          ["Adagio", 60],
          ["Andante", 76],
          ["Moderato", 100],
          ["Allegro", 120],
          ["Presto", 168],
        ] as const
      ).map(([label, bpm]): MusicNotation => ({
        label,
        code: `\\tempo "${label}" 4 = ${bpm}`,
        symbol: label,
        application: "before",
        example: `\\tempo "${label}" 4 = ${bpm} c4 d e f`,
      })),
      textMark("Ritardando", "rit."),
      textMark("A tempo", "a tempo"),
      textMark("Accelerando", "accel."),
      textMark("Rallentando", "rall."),
      textMark("Rubato", "rubato"),
      textMark("Dolce", "dolce"),
      textMark("Cantabile", "cantabile"),
      textMark("Legato", "legato"),
      textMark("Molto espressivo", "molto espr."),
    ],
  },
  {
    label: "Repeats & structure",
    items: [
      {
        label: "Repeat twice",
        code: "\\repeat volta 2 { c4 d e f }",
        glyph: "\uE040",
        application: "wrap",
        selectionCode: "\\repeat volta 2 {",
        endCode: "}",
        example: "\\repeat volta 2 { c4 d e f }",
      },
      {
        label: "Final bar line",
        code: '\\bar "|."',
        glyph: "\uE032",
        application: "after",
        example: 'c4 d e f \\bar "|."',
      },
      {
        label: "Double bar line",
        code: '\\bar "||"',
        glyph: "\uE031",
        application: "after",
        example: 'c4 d e f \\bar "||"',
      },
      {
        label: "Start repeat bar line",
        code: '\\bar ".|:"',
        glyph: "\uE040",
        application: "before",
        example: '\\bar ".|:" c4 d e f',
      },
      {
        label: "End repeat bar line",
        code: '\\bar ":|."',
        glyph: "\uE041",
        application: "after",
        example: 'c4 d e f \\bar ":|."',
      },
      {
        label: "Rehearsal mark",
        code: "\\mark \\default",
        symbol: "A",
        application: "before",
        example: "\\mark \\default c4 d e f",
      },
      {
        label: "Segno",
        code: '\\mark \\markup { \\musicglyph "scripts.segno" }',
        glyph: "\uE047",
        application: "before",
        example: '\\mark \\markup { \\musicglyph "scripts.segno" } c4 d e f',
      },
      {
        label: "Coda",
        code: '\\mark \\markup { \\musicglyph "scripts.coda" }',
        glyph: "\uE048",
        application: "before",
        example: '\\mark \\markup { \\musicglyph "scripts.coda" } c4 d e f',
      },
    ],
  },
];
