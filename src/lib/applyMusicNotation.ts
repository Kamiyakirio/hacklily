import type { LilypondNote as Note } from "./lilypondSource";
import {
  commentEnd,
  expressionEnd,
  quotedEnd,
  readLilypondNotes,
} from "./lilypondSource";
import type { MusicNotation } from "./musicNotations";
import { DYNAMIC_CODES, MUSIC_NOTATION_GROUPS } from "./musicNotations";

const DYNAMIC = new RegExp(
  `\\\\(?:${DYNAMIC_CODES.map((code) => code.slice(1))
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![A-Za-z-])`,
);
const POST_EVENTS = new Set(
  MUSIC_NOTATION_GROUPS.flatMap((group) => group.items)
    .filter((item) =>
      ["each", "first", "last", "span", "between"].includes(item.application),
    )
    .flatMap((item) => [item.code, item.endCode || ""])
    .map((code) => /^[-_^]?(\\(?:[A-Za-z][\w-]*|\d+|[()]))/.exec(code)?.[1])
    .filter(Boolean),
);
const ARTICULATION_SHORTCUTS: Record<string, string> = {
  "\\staccato": ".",
  "\\accent": ">",
  "\\tenuto": "-",
  "\\marcato": "^",
  "\\staccatissimo": "!",
  "\\portato": "_",
};

function selectedNotes(notes: Note[], start: number, end: number): Note[] {
  return start === end
    ? []
    : notes.filter(
        (note) => note.pitched && note.start < end && note.end > start,
      );
}

export function selectedNoteCount(
  source: string,
  start: number,
  end: number,
): number {
  return selectedNotes(readLilypondNotes(source).notes, start, end).length;
}

function skipTrivia(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) cursor++;
    else if (source[cursor] === "%") cursor = commentEnd(source, cursor);
    else break;
  }
  return cursor;
}

// Include existing articulations, slurs, fingerings, and text after the last note
// before adding a standalone command or closing a selected passage.
export function postEventEnd(source: string, note: Note): number {
  let end = note.end;
  let cursor = end;
  while (cursor < source.length) {
    cursor = skipTrivia(source, cursor);
    const directed = /[-_^]/.test(source[cursor] || "");
    if (directed) cursor = skipTrivia(source, cursor + 1);
    const command = /^\\(?:[A-Za-z][\w-]*|\d+|[()])/.exec(source.slice(cursor));
    if (command) {
      if (!directed && !POST_EVENTS.has(command[0])) break;
      cursor += command[0].length;
      if (command[0] === "\\markup") cursor = expressionEnd(source, cursor);
      if (command[0] === "\\rightHandFinger")
        cursor = expressionEnd(source, cursor);
    } else if (source[cursor] === '"') cursor = quotedEnd(source, cursor);
    else if (directed) {
      const mark = /^(?:\d+|[.>^!_+-])/.exec(source.slice(cursor));
      if (!mark) break;
      cursor += mark[0].length;
    } else if (/[~()[\]]/.test(source[cursor] || "")) cursor++;
    else break;
    end = cursor;
  }
  return end;
}

function rhythms(source: string, notes: Note[]) {
  let inherited = 1 / 4;
  let inheritedNotation = "4";
  return notes.map((note) => {
    const core = source.slice(note.start, note.end).replace(/:\d+$/, "");
    const match =
      /(?:\d+|\\breve|\\longa|\\maxima)(?:\s*\.)*(?:\s*\*\s*\d+(?:\s*\/\s*\d+)?)*$/.exec(
        core,
      );
    let length = inherited;
    if (match) {
      const base = /^(\d+|\\breve|\\longa|\\maxima)((?:\s*\.)*)/.exec(match[0]);
      const unit = /^\d/.test(base[1])
        ? 1 / Number(base[1])
        : { "\\breve": 2, "\\longa": 4, "\\maxima": 8 }[base[1]];
      const dots = (base[2].match(/\./g) || []).length;
      inherited = unit * (2 - 1 / 2 ** dots);
      inheritedNotation = match[0].replace(/\s/g, "");
      length = inherited;
      for (const factor of match[0].matchAll(/\*\s*(\d+)(?:\s*\/\s*(\d+))?/g))
        length *= Number(factor[1]) / Number(factor[2] || 1);
      inherited = length;
    }
    return {
      length,
      notation: inheritedNotation,
      explicit: !!match,
      start: note.start + (match?.index ?? core.length),
      end: note.end,
    };
  });
}

/** A single replacement so source text, selection, and undo stay together. */
export function applyMusicNotation(
  source: string,
  start: number,
  end: number,
  notation: MusicNotation,
): {
  start: number;
  end: number;
  text: string;
  selectionStart?: number;
  selectionEnd?: number;
} | null {
  const { notes, masked } = readLilypondNotes(source);
  const selected = selectedNotes(notes, start, end);
  if (!selected.length || !notation.application) return null;
  if (
    (notation.application === "span" || notation.application === "between") &&
    selected.length < 2
  )
    return null;
  const edits: { start: number; end: number; text: string }[] = [];
  let selectionStartBefore: number | undefined;
  let selectionEndBefore: number | undefined;
  function insert(offset: number, text: string) {
    edits.push({ start: offset, end: offset, text });
  }
  function append(note: Note, code: string) {
    const next = notes[notes.indexOf(note) + 1];
    const tailEnd = next?.start ?? source.length;
    const tail = (code.includes('"') ? source : masked)
      .slice(note.end, tailEnd)
      .split(/[{}|]/)[0];
    const command = code.replace(/^[-_^]/, "");
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const shortcut = ARTICULATION_SHORTCUTS[command];
    if (shortcut && new RegExp(`[-_^]\\s*\\${shortcut}`).test(tail)) return;
    // A new absolute dynamic replaces the existing dynamic on that note.
    if (DYNAMIC.exec(code)?.[0] === code) {
      const existing = DYNAMIC.exec(tail);
      if (existing) {
        if (existing[0] !== code) {
          edits.push({
            start: note.end + existing.index,
            end: note.end + existing.index + existing[0].length,
            text: code,
          });
        }
        return;
      }
    }
    if (
      new RegExp(
        `${escaped}${/[A-Za-z]$/.test(command) ? "(?![A-Za-z-])" : ""}`,
      ).test(tail)
    )
      return;
    const after =
      /[A-Za-z_-]/.test(source[note.end] || "") && /[A-Za-z]$/.test(code)
        ? " "
        : "";
    edits.push({
      start: note.end,
      end: note.end,
      text: `${code === "\\breathe" ? " " : ""}${code}${after}`,
    });
  }
  switch (notation.application) {
    case "each":
      selected.forEach((note) => append(note, notation.code));
      break;
    case "first":
      append(selected[0], notation.code);
      break;
    case "last":
      append(selected.at(-1), notation.code);
      break;
    case "between":
      selected.slice(0, -1).forEach((note, index) => {
        if (notes[notes.indexOf(note) + 1] === selected[index + 1])
          append(note, notation.code);
      });
      break;
    case "span":
      append(selected[0], notation.code);
      append(selected.at(-1), notation.endCode);
      break;
    case "before":
      insert(selected[0].start, `${notation.code} `);
      break;
    case "after":
      {
        const offset = postEventEnd(source, selected.at(-1));
        const after =
          offset < source.length && !/\s/.test(source[offset]) ? " " : "";
        insert(offset, ` ${notation.code}${after}`);
      }
      break;
    case "wrap":
      insert(selected[0].start, `${notation.selectionCode} `);
      insert(postEventEnd(source, selected.at(-1)), ` ${notation.endCode}`);
      break;
    case "tremolo":
      selected.forEach((note) => {
        const previous = /:\d+$/.exec(source.slice(note.start, note.end));
        edits.push({
          start: previous ? note.start + previous.index : note.end,
          end: note.end,
          text: notation.code,
        });
      });
      break;
    case "tremoloPair": {
      if (
        selected.length !== 2 ||
        notes[notes.indexOf(selected[0]) + 1] !== selected[1]
      )
        return null;
      const durations = rhythms(source, notes);
      const first = durations[notes.indexOf(selected[0])];
      const second = durations[notes.indexOf(selected[1])];
      const existing = /\\repeat\s+tremolo\s+(\d+)\s*\{\s*$/.exec(
        masked.slice(0, selected[0].start),
      );
      const paired =
        existing &&
        source[skipTrivia(source, postEventEnd(source, selected[1]))] === "}";
      selectionStartBefore = Math.min(
        start,
        paired ? existing.index : selected[0].start,
      );
      selectionEndBefore = Math.max(
        end,
        paired
          ? skipTrivia(source, postEventEnd(source, selected[1])) + 1
          : postEventEnd(source, selected[1]),
      );
      const repeatCount =
        ((first.length + second.length) *
          notation.tremoloDivision *
          (paired ? Number(existing[1]) : 1)) /
        2;
      if (!Number.isInteger(repeatCount) || repeatCount < 1) return null;
      if (paired) {
        const countStart = existing.index + existing[0].indexOf(existing[1]);
        edits.push({
          start: countStart,
          end: countStart + existing[1].length,
          text: String(repeatCount),
        });
      } else insert(selected[0].start, `\\repeat tremolo ${repeatCount} { `);
      for (const rhythm of [first, second])
        edits.push({
          start: rhythm.start,
          end: rhythm.end,
          text: String(notation.tremoloDivision),
        });
      if (!paired) insert(postEventEnd(source, selected[1]), " }");
      // A written tremolo subdivision changes LilyPond's inherited duration.
      // Keep the next unselected event at its original written duration.
      const next = durations[notes.indexOf(selected[1]) + 1];
      if (next && !next.explicit) insert(next.start, next.notation);
      break;
    }
  }
  const rangeStart = Math.min(
    start,
    selected[0].start,
    selectionStartBefore ?? selected[0].start,
    ...edits.map((edit) => edit.start),
  );
  const rangeEnd = Math.max(
    end,
    selected.at(-1).end,
    selectionEndBefore ?? selected.at(-1).end,
    ...edits.map((edit) => edit.end),
  );
  let text = source.slice(rangeStart, rangeEnd);
  // Apply later insertions first when several edits share an offset.
  for (const edit of edits.toReversed().sort((a, b) => b.start - a.start)) {
    text =
      text.slice(0, edit.start - rangeStart) +
      edit.text +
      text.slice(edit.end - rangeStart);
  }
  if (selectionEndBefore !== undefined) {
    const movedEnd =
      selectionEndBefore +
      edits
        .filter((edit) => edit.end <= selectionEndBefore)
        .reduce(
          (delta, edit) => delta + edit.text.length - (edit.end - edit.start),
          0,
        );
    return {
      start: rangeStart,
      end: rangeEnd,
      text,
      selectionStart: selectionStartBefore,
      selectionEnd: movedEnd,
    };
  }
  return { start: rangeStart, end: rangeEnd, text };
}

export function applyMusicNotationToRanges(
  source: string,
  ranges: { start: number; end: number }[],
  notation: MusicNotation,
) {
  const changes = ranges.map((range) =>
    applyMusicNotation(source, range.start, range.end, notation),
  );
  const edits = changes
    .filter(
      (change) =>
        change && change.text !== source.slice(change.start, change.end),
    )
    .filter(
      (change, index, all) =>
        all.findIndex(
          (item) =>
            item.start === change.start &&
            item.end === change.end &&
            item.text === change.text,
        ) === index,
    );
  const deltaAt = (offset: number) =>
    edits
      .filter((edit) => edit.end <= offset)
      .reduce(
        (delta, edit) => delta + edit.text.length - (edit.end - edit.start),
        0,
      );
  const selections = ranges.map((range, index) => {
    const change = changes[index];
    if (!change)
      return {
        start: range.start + deltaAt(range.start),
        end: range.end + deltaAt(range.end),
      };
    const shift = deltaAt(change.start);
    return {
      start: (change.selectionStart ?? change.start) + shift,
      end: (change.selectionEnd ?? change.start + change.text.length) + shift,
    };
  });
  return { edits, selections, applied: changes.some(Boolean) };
}
