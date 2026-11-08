export interface MusicNotation {
  label: string;
  code: string;
  example: string;
  glyph?: string;
  symbol?: string;
}

export const MUSIC_NOTATION_GROUPS: {
  label: string;
  items: MusicNotation[];
}[] = [
  {
    label: "Dynamics",
    items: [
      {
        label: "Pianississimo",
        code: "\\ppp",
        glyph: "\uE520\uE520\uE520",
        example: "c4\\ppp d e f",
      },
      {
        label: "Pianissimo",
        code: "\\pp",
        glyph: "\uE520\uE520",
        example: "c4\\pp d e f",
      },
      { label: "Piano", code: "\\p", glyph: "\uE520", example: "c4\\p d e f" },
      {
        label: "Mezzo-piano",
        code: "\\mp",
        glyph: "\uE521\uE520",
        example: "c4\\mp d e f",
      },
      {
        label: "Mezzo-forte",
        code: "\\mf",
        glyph: "\uE521\uE522",
        example: "c4\\mf d e f",
      },
      { label: "Forte", code: "\\f", glyph: "\uE522", example: "c4\\f d e f" },
      {
        label: "Fortissimo",
        code: "\\ff",
        glyph: "\uE522\uE522",
        example: "c4\\ff d e f",
      },
      {
        label: "Fortississimo",
        code: "\\fff",
        glyph: "\uE522\uE522\uE522",
        example: "c4\\fff d e f",
      },
      {
        label: "Sforzato",
        code: "\\sfz",
        glyph: "\uE539",
        example: "c4\\sfz d e f",
      },
      {
        label: "Forte-piano",
        code: "\\fp",
        glyph: "\uE534",
        example: "c4\\fp d e f",
      },
      {
        label: "Start crescendo",
        code: "\\<",
        symbol: "〈",
        example: "c4\\< d e f\\!",
      },
      {
        label: "Start diminuendo",
        code: "\\>",
        symbol: "〉",
        example: "c4\\> d e f\\!",
      },
      {
        label: "End hairpin",
        code: "\\!",
        symbol: "!",
        example: "c4\\< d e f\\!",
      },
    ],
  },
  {
    label: "Articulations",
    items: [
      {
        label: "Staccato",
        code: "-\\staccato",
        glyph: "\uE4A2",
        example: "c4-\\staccato d e f",
      },
      {
        label: "Accent",
        code: "-\\accent",
        glyph: "\uE4A0",
        example: "c4-\\accent d e f",
      },
      {
        label: "Tenuto",
        code: "-\\tenuto",
        glyph: "\uE4A4",
        example: "c4-\\tenuto d e f",
      },
      {
        label: "Marcato",
        code: "-\\marcato",
        glyph: "\uE4AC",
        example: "c4-\\marcato d e f",
      },
      {
        label: "Staccatissimo",
        code: "-\\staccatissimo",
        glyph: "\uE4A6",
        example: "c4-\\staccatissimo d e f",
      },
      {
        label: "Portato",
        code: "-\\portato",
        glyph: "\uE4B2",
        example: "c4-\\portato d e f",
      },
      {
        label: "Fermata",
        code: "\\fermata",
        glyph: "\uE4C0",
        example: "c4\\fermata d e f",
      },
      {
        label: "Breath mark",
        code: "\\breathe",
        glyph: "\uE4CE",
        example: "c4 d \\breathe e f",
      },
    ],
  },
  {
    label: "Ornaments",
    items: [
      {
        label: "Trill",
        code: "\\trill",
        glyph: "\uE566",
        example: "c4\\trill d e f",
      },
      {
        label: "Mordent",
        code: "\\mordent",
        glyph: "\uE56C",
        example: "c4\\mordent d e f",
      },
      {
        label: "Turn",
        code: "\\turn",
        glyph: "\uE567",
        example: "c4\\turn d e f",
      },
      {
        label: "Arpeggio",
        code: "\\arpeggio",
        glyph: "\uE634",
        example: "<c e g>1\\arpeggio",
      },
    ],
  },
  {
    label: "Slurs, ties & beams",
    items: [
      { label: "Start slur", code: "(", symbol: "⌒", example: "c4( d e f)" },
      { label: "End slur", code: ")", symbol: "⌒", example: "c4( d e f)" },
      { label: "Tie", code: "~", symbol: "~", example: "c2~ c2" },
      { label: "Start beam", code: "[", symbol: "[", example: "c8[ d e f] g2" },
      { label: "End beam", code: "]", symbol: "]", example: "c8[ d e f] g2" },
    ],
  },
  {
    label: "Tempo & expression",
    items: [
      {
        label: "Metronome mark",
        code: "\\tempo 4 = 120",
        symbol: "♩",
        example: "\\tempo 4 = 120 c4 d e f",
      },
      {
        label: "Adagio",
        code: '\\tempo "Adagio" 4 = 60',
        symbol: "Adagio",
        example: '\\tempo "Adagio" 4 = 60 c4 d e f',
      },
      {
        label: "Andante",
        code: '\\tempo "Andante" 4 = 76',
        symbol: "Andante",
        example: '\\tempo "Andante" 4 = 76 c4 d e f',
      },
      {
        label: "Allegro",
        code: '\\tempo "Allegro" 4 = 120',
        symbol: "Allegro",
        example: '\\tempo "Allegro" 4 = 120 c4 d e f',
      },
      {
        label: "Ritardando",
        code: '^\\markup \\italic "rit."',
        symbol: "rit.",
        example: 'c4^\\markup \\italic "rit." d e f',
      },
      {
        label: "A tempo",
        code: '^\\markup \\italic "a tempo"',
        symbol: "a tempo",
        example: 'c4^\\markup \\italic "a tempo" d e f',
      },
    ],
  },
  {
    label: "Repeats & structure",
    items: [
      {
        label: "Repeat twice",
        code: "\\repeat volta 2 { c4 d e f }",
        glyph: "\uE040",
        example: "\\repeat volta 2 { c4 d e f }",
      },
      {
        label: "Final bar line",
        code: '\\bar "|."',
        glyph: "\uE032",
        example: 'c4 d e f \\bar "|."',
      },
      {
        label: "Double bar line",
        code: '\\bar "||"',
        glyph: "\uE031",
        example: 'c4 d e f \\bar "||"',
      },
      {
        label: "Rehearsal mark",
        code: "\\mark \\default",
        symbol: "A",
        example: "\\mark \\default c4 d e f",
      },
      {
        label: "Segno",
        code: '\\mark \\markup { \\musicglyph "scripts.segno" }',
        glyph: "\uE047",
        example: '\\mark \\markup { \\musicglyph "scripts.segno" } c4 d e f',
      },
      {
        label: "Coda",
        code: '\\mark \\markup { \\musicglyph "scripts.coda" }',
        glyph: "\uE048",
        example: '\\mark \\markup { \\musicglyph "scripts.coda" } c4 d e f',
      },
    ],
  },
];
