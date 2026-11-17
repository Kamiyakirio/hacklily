import { postEventEnd } from "./applyMusicNotation";
import { readLilypondNotes } from "./lilypondSource";
import type { LilypondNote } from "./lilypondSource";

export interface OffsetRange {
  start: number;
  end: number;
}
export interface IntervalEdit extends OffsetRange {
  text: string;
}
interface Pitch {
  step: number;
  alteration: number;
  position: number;
}
interface PitchToken {
  step: number;
  alteration: number;
  octaves: number;
  length: number;
}
interface KeyState {
  alterations: number[];
  defined: boolean;
}
interface ChordState {
  pitches: Pitch[] | null;
  changed: boolean;
}
interface Context {
  relative: boolean;
  supported: boolean;
  key: KeyState;
  chord: ChordState;
  reference: { previous: Pitch | null };
  fixedOctaves: number;
}

const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ["c", "d", "e", "f", "g", "a", "b"];
const SOLFEGE = ["do", "re", "mi", "fa", "sol", "la", "si"];
const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

function pitchToken(text: string, language: string): PitchToken | null {
  const match = /^([a-z]+)((?:\s*[',])*)(?:=[',]*)?[!?]?/.exec(text);
  const name = match && /^(do|re|mi|fa|sol|la|si|[a-h])(.*)$/.exec(match[1]);
  if (!name) return null;
  const german = language === "deutsch";
  const root = name[1];
  const step =
    root === "h"
      ? 6
      : LETTERS.includes(root)
        ? LETTERS.indexOf(root)
        : SOLFEGE.indexOf(root);
  const alterations: Record<string, number> = {
    "": 0,
    is: 1,
    isis: 2,
    es: -1,
    eses: -2,
    s: language === "english" ? 1 : root === "a" || root === "e" ? -1 : 1,
    ss: 2,
    f: -1,
    ff: -2,
    x: 2,
    sharp: 1,
    sharpsharp: 2,
    flat: -1,
    flatflat: -2,
    ih: 0.5,
    eh: -0.5,
    isih: 1.5,
    eseh: -1.5,
    qs: 0.5,
    qf: -0.5,
    tqs: 1.5,
    tqf: -1.5,
    b: -1,
    bb: -2,
    d: 1,
    dd: 2,
  };
  if (!(name[2] in alterations)) return null;
  return {
    step,
    alteration: alterations[name[2]] + (german && root === "b" ? -1 : 0),
    octaves: match[2]
      .split("")
      .reduce((n, mark) => n + (mark === "'" ? 1 : mark === "," ? -1 : 0), 0),
    length: match[0].length,
  };
}

function nearest(step: number, previous: number): number {
  let position = Math.floor(previous / 7) * 7 + step;
  if (position - previous > 3) position -= 7;
  if (previous - position > 3) position += 7;
  return position;
}

function pitchesIn(
  inner: string,
  relative: boolean,
  language: string,
  reference: Pitch | null,
  fixedOctaves: number,
): Pitch[] {
  const pitches: Pitch[] = [];
  const words = /\\[A-Za-z][\w-]*|[a-z]+/g;
  for (let word = words.exec(inner); word; word = words.exec(inner)) {
    if (word[0].startsWith("\\")) continue;
    const pitch = pitchToken(inner.slice(word.index), language);
    if (!pitch) continue;
    const previous = pitches.at(-1) ?? reference;
    const position =
      (relative && previous
        ? nearest(pitch.step, previous.position)
        : 21 + pitch.step + fixedOctaves * 7) +
      pitch.octaves * 7;
    pitches.push({ step: pitch.step, alteration: pitch.alteration, position });
    words.lastIndex = word.index + pitch.length;
  }
  return pitches;
}

function chromatic(pitch: Pitch): number {
  return (
    Math.floor(pitch.position / 7) * 12 +
    NATURALS[pitch.step] +
    pitch.alteration
  );
}

function spelling(pitch: Pitch, language: string): string {
  const solfege = [
    "italiano",
    "espanol",
    "español",
    "français",
    "portugues",
    "catalan",
  ].includes(language);
  let root = (solfege ? SOLFEGE : LETTERS)[pitch.step];
  let alteration = pitch.alteration;
  if (language === "deutsch" && pitch.step === 6) {
    if (alteration === -1) {
      root = "b";
      alteration = 0;
    } else root = "h";
  }
  const sharp = language === "english" ? "s" : solfege ? "d" : "is";
  const flat = language === "english" ? "f" : solfege ? "b" : "es";
  const suffix =
    alteration >= 0
      ? sharp.repeat(Math.floor(alteration))
      : flat.repeat(Math.floor(-alteration));
  const quarter =
    alteration % 1 === 0
      ? ""
      : language === "english"
        ? alteration > 0
          ? "qs"
          : "qf"
        : alteration > 0
          ? "ih"
          : "eh";
  return root + suffix + quarter;
}

function renderPitch(
  pitch: Pitch,
  relative: boolean,
  previous: Pitch,
  language: string,
  fixedOctaves = 0,
): string {
  const base = relative
    ? nearest(pitch.step, previous.position)
    : 21 + pitch.step + fixedOctaves * 7;
  const octaves = (pitch.position - base) / 7;
  return (
    spelling(pitch, language) +
    (octaves > 0 ? "'".repeat(octaves) : ",".repeat(-octaves))
  );
}

function keyAlterations(tonic: PitchToken, mode: string): number[] {
  const result = Array<number>(7).fill(0);
  MODES[mode].forEach((offset, degree) => {
    const step = (tonic.step + degree) % 7;
    result[step] =
      NATURALS[tonic.step] +
      tonic.alteration +
      offset -
      NATURALS[step] -
      (step < tonic.step ? 12 : 0);
  });
  return result;
}

/** Stack a diatonic interval on each selected note/chord, using its highest pitch. */
export function stackNoteIntervals(
  source: string,
  ranges: OffsetRange[],
  interval: number,
  direction: 1 | -1,
) {
  const { notes, masked } = readLilypondNotes(source);
  const targetsByRange = ranges.map((range) =>
    notes.filter(
      (note) =>
        note.pitched &&
        (range.start === range.end
          ? note.start <= range.start &&
            range.start <= postEventEnd(source, note)
          : note.start < range.end && note.end > range.start),
    ),
  );
  const targets = new Set(targetsByRange.flat());
  const edits: IntervalEdit[] = [];
  const changed = new Map<LilypondNote, number>();
  if (!targets.size || interval < 1 || interval > 8)
    return { edits, selections: ranges };
  const noteAt = new Map(notes.map((note) => [note.start, note]));
  let language = "nederlands";
  let context: Context = {
    relative: false,
    supported: true,
    key: { alterations: Array<number>(7).fill(0), defined: false },
    chord: { pitches: null, changed: false },
    reference: { previous: null },
    fixedOctaves: 0,
  };
  const frames: { previous: Context; variable: string | null }[] = [];
  const variables = new Map<string, number[]>();
  let pendingMode: boolean | undefined;
  let pendingReference: { previous: Pitch | null } | undefined;
  let pendingFixedOctaves: number | undefined;
  let pendingSupported: boolean | undefined;
  let pendingVariable: string | null = null;
  let pendingStaff = false;
  const tokens = /\\[A-Za-z][\w-]*|<<|>>|<[^<>]*>|[A-Za-z][A-Za-z_-]*|[{}]/g;
  for (let token = tokens.exec(masked); token; token = tokens.exec(masked)) {
    const value = token[0];
    if (value === "{") {
      const previous = context;
      const separate = !!pendingVariable || pendingStaff;
      context = {
        ...context,
        relative: pendingMode ?? context.relative,
        supported: pendingSupported ?? context.supported,
        reference:
          pendingReference ??
          (separate ? { previous: null } : context.reference),
        fixedOctaves: pendingFixedOctaves ?? context.fixedOctaves,
        key: separate
          ? { alterations: [...context.key.alterations], defined: false }
          : context.key,
        chord: separate ? { pitches: null, changed: false } : context.chord,
      };
      frames.push({ previous, variable: pendingVariable });
      pendingMode = undefined;
      pendingReference = undefined;
      pendingFixedOctaves = undefined;
      pendingSupported = undefined;
      pendingVariable = null;
      pendingStaff = false;
      continue;
    }
    if (value === "}") {
      const frame = frames.pop();
      if (frame?.variable && context.key.defined)
        variables.set(`\\${frame.variable}`, [...context.key.alterations]);
      if (frame) context = frame.previous;
      continue;
    }
    if (value.startsWith("\\")) {
      if (
        ["\\relative", "\\absolute", "\\fixed", "\\transpose"].includes(value)
      ) {
        pendingMode = value === "\\relative";
        const anchor = pitchToken(
          masked.slice(tokens.lastIndex).trimStart(),
          language,
        );
        pendingReference = {
          previous:
            value === "\\relative" && anchor
              ? {
                  step: anchor.step,
                  alteration: anchor.alteration,
                  position: 21 + anchor.step + anchor.octaves * 7,
                }
              : null,
        };
        pendingFixedOctaves = value === "\\fixed" ? (anchor?.octaves ?? 0) : 0;
      }
      if (["\\chordmode", "\\drummode"].includes(value))
        pendingSupported = false;
      if (value === "\\notemode") pendingSupported = true;
      if (value === "\\new" || value === "\\context")
        pendingStaff =
          /^\s*(?:Staff|PianoStaff|GrandStaff|TabStaff|DrumStaff)\b/.test(
            masked.slice(tokens.lastIndex),
          );
      if (value === "\\language" || value === "\\include") {
        const name = /^\s*"([^"]+)"/.exec(source.slice(tokens.lastIndex))?.[1];
        if (
          name &&
          (value === "\\language" ||
            /^(?:english|nederlands|deutsch)\.ly$/.test(name))
        )
          language = name.replace(/\.ly$/, "");
      }
      if (value === "\\key") {
        const tail = masked.slice(tokens.lastIndex);
        const whitespace = /^\s*/.exec(tail)[0].length;
        const tonic = pitchToken(tail.slice(whitespace), language);
        const mode =
          tonic &&
          /^\s*\\([A-Za-z]+)/.exec(tail.slice(whitespace + tonic.length))?.[1];
        if (tonic && MODES[mode]) {
          context.key.alterations = keyAlterations(tonic, mode);
          context.key.defined = true;
        }
      }
      if (variables.has(value)) {
        context.key.alterations = [...variables.get(value)];
        context.key.defined = true;
      }
      continue;
    }
    const note = noteAt.get(token.index);
    if (!note) {
      if (/^\s*=/.test(masked.slice(tokens.lastIndex))) pendingVariable = value;
      continue;
    }
    tokens.lastIndex = note.end;
    const relative = pendingMode ?? context.relative;
    const supported = pendingSupported ?? context.supported;
    const reference = pendingReference ?? context.reference;
    const fixedOctaves = pendingFixedOctaves ?? context.fixedOctaves;
    pendingMode = undefined;
    pendingSupported = undefined;
    pendingReference = undefined;
    pendingFixedOctaves = undefined;
    if (!note.pitched || !supported) continue;
    const chord = source[note.start] === "<";
    const repeated = source[note.start] === "q";
    const pitch =
      !chord && !repeated
        ? pitchToken(masked.slice(note.start), language)
        : null;
    const pitchEnd = chord
      ? masked.indexOf(">", note.start) + 1
      : note.start + (pitch?.length ?? 1);
    const rawInner = chord
      ? source.slice(note.start + 1, pitchEnd - 1)
      : source.slice(note.start, pitchEnd);
    const cleanInner = chord
      ? masked.slice(note.start + 1, pitchEnd - 1)
      : rawInner;
    const pitches = repeated
      ? (context.chord.pitches ?? [])
      : pitchesIn(
          cleanInner,
          relative,
          language,
          reference.previous,
          fixedOctaves,
        );
    if (!pitches.length) continue;
    const inner = repeated
      ? pitches
          .map((item) => renderPitch(item, false, item, language))
          .join(" ")
      : rawInner;
    function replaceRepeated(chordInner: string) {
      const end = postEventEnd(source, note);
      const middleC = spelling(
        { position: 21, step: 0, alteration: 0 },
        language,
      );
      edits.push({
        start: note.start,
        end,
        text: `\\fixed ${middleC} { <${chordInner}>${source.slice(note.start + 1, end)} }`,
      });
      if (targets.has(note)) changed.set(note, end);
    }
    let altered = false;
    if (targets.has(note)) {
      const highest = pitches.reduce((a, b) =>
        chromatic(b) > chromatic(a) ||
        (chromatic(a) === chromatic(b) && b.position > a.position)
          ? b
          : a,
      );
      const position = highest.position + direction * (interval - 1);
      const step = ((position % 7) + 7) % 7;
      const addition: Pitch = {
        position,
        step,
        alteration:
          interval === 1 || interval === 8
            ? highest.alteration
            : context.key.alterations[step],
      };
      const duplicate =
        interval !== 1 &&
        pitches.some(
          (item) =>
            item.position === addition.position &&
            item.alteration === addition.alteration,
        );
      if (!duplicate) {
        const added = renderPitch(
          addition,
          repeated ? false : relative,
          pitches.at(-1),
          language,
          repeated ? 0 : fixedOctaves,
        );
        if (repeated) replaceRepeated(`${inner} ${added}`);
        else
          edits.push({
            start: note.start,
            end: pitchEnd,
            text: `<${inner}${/\s$/.test(inner) ? "" : " "}${added}>`,
          });
        changed.set(note, repeated ? postEventEnd(source, note) : note.end);
        altered = true;
      }
    }
    if (repeated && !altered && context.chord.changed) {
      // Editing an earlier chord must not silently change an unselected q.
      replaceRepeated(inner);
    }
    if (chord) {
      context.chord.pitches = pitches;
    }
    // q repeats absolute pitches without changing the relative octave reference.
    if (!repeated) reference.previous = pitches[0];
    if (chord || altered || (repeated && context.chord.changed))
      context.chord.changed = altered;
  }
  const move = (offset: number) =>
    offset +
    edits
      .filter((edit) => edit.end <= offset)
      .reduce(
        (delta, edit) => delta + edit.text.length - (edit.end - edit.start),
        0,
      );
  const selections = ranges.map((range, index) => {
    const selected = targetsByRange[index].filter((note) => changed.has(note));
    return {
      start: move(Math.min(range.start, ...selected.map((note) => note.start))),
      end: move(
        Math.max(range.end, ...selected.map((note) => changed.get(note))),
      ),
    };
  });
  return { edits, selections };
}
