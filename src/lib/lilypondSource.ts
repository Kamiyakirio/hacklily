export interface LilypondNote {
  start: number;
  end: number;
  pitched: boolean;
}

const PITCH =
  /^(?:[a-h]|do|re|mi|fa|sol|la|si)(?:isis|eses|isih|eseh|is|es|ih|eh|ss|ff|s|f|qs|qf|tqs|tqf|sharpsharp|flatflat|sharp|flat|x)?$/;
const PITCH_ARGUMENTS: Record<string, number> = {
  "\\relative": 1,
  "\\fixed": 1,
  "\\key": 1,
  "\\transpose": 2,
  "\\transposition": 1,
  "\\octaveCheck": 1,
};
const TEXT_COMMANDS = new Set([
  "\\markup",
  "\\markuplist",
  "\\lyricmode",
  "\\lyrics",
  "\\addlyrics",
  "\\header",
  "\\paper",
  "\\layout",
  "\\midi",
  "\\with",
]);

export function quotedEnd(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") i += 2;
    else if (source[i++] === '"') break;
  }
  return i;
}

export function commentEnd(source: string, start: number): number {
  if (!source.startsWith("%{", start)) {
    const end = source.indexOf("\n", start);
    return end < 0 ? source.length : end;
  }
  let depth = 1;
  let i = start + 2;
  while (i < source.length && depth) {
    if (source.startsWith("%{", i)) {
      depth++;
      i += 2;
    } else if (source.startsWith("%}", i)) {
      depth--;
      i += 2;
    } else i++;
  }
  return i;
}

function schemeEnd(source: string, start: number): number {
  let i = start + 1;
  while (/[\s'`,]/.test(source[i] || "")) i++;
  if (source[i] === '"') return quotedEnd(source, i);
  if (source[i] !== "(") {
    while (i < source.length && !/[\s{}()]/.test(source[i])) i++;
    return i;
  }
  let depth = 0;
  do {
    if (source[i] === '"') i = quotedEnd(source, i);
    else if (source[i] === ";") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
    } else {
      if (source[i] === "(") depth++;
      if (source[i] === ")") depth--;
      i++;
    }
  } while (i < source.length && depth);
  return i;
}

// A text expression may be a string, a braced block, or a markup command chain.
export function expressionEnd(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    if (/\s/.test(source[i])) i++;
    else if (source[i] === "%") i = commentEnd(source, i);
    else break;
  }
  if (source[i] === '"') return quotedEnd(source, i);
  if (source[i] === "#" || source[i] === "$") return schemeEnd(source, i);
  if (source[i] === "\\") {
    const command = /^\\[A-Za-z][\w-]*/.exec(source.slice(i));
    return command ? expressionEnd(source, i + command[0].length) : i + 2;
  }
  if (source[i] !== "{") {
    while (i < source.length && !/[\s{}]/.test(source[i])) i++;
    return i;
  }
  let depth = 0;
  do {
    if (source[i] === '"') i = quotedEnd(source, i);
    else if (source[i] === "%") i = commentEnd(source, i);
    else if (source[i] === "#" || source[i] === "$") i = schemeEnd(source, i);
    else {
      if (source[i] === "{") depth++;
      if (source[i] === "}") depth--;
      i++;
    }
  } while (i < source.length && depth);
  return i;
}

// Keep offsets intact while excluding non-music from note matching.
function maskText(source: string): string {
  const chunks: string[] = [];
  let previous = 0;
  for (let i = 0; i < source.length;) {
    const start = i;
    if (source[i] === "%") i = commentEnd(source, i);
    else if (source[i] === '"') i = quotedEnd(source, i);
    else if (source[i] === "#" || source[i] === "$") i = schemeEnd(source, i);
    else if (source[i] === "\\") {
      const command = /^\\[A-Za-z][\w-]*/.exec(source.slice(i));
      if (command && TEXT_COMMANDS.has(command[0])) {
        i = expressionEnd(source, i + command[0].length);
      } else if (command?.[0] === "\\lyricsto") {
        i = expressionEnd(source, expressionEnd(source, i + command[0].length));
      } else {
        i += command?.[0].length || 2;
        continue;
      }
    } else {
      i++;
      continue;
    }
    chunks.push(
      source.slice(previous, start),
      source.slice(start, i).replace(/[^\r\n]/g, " "),
    );
    previous = i;
  }
  chunks.push(source.slice(previous));
  return chunks.join("");
}

export function readLilypondNotes(source: string): {
  notes: LilypondNote[];
  masked: string;
} {
  const masked = maskText(source);
  const tokens =
    /\\[A-Za-z][\w-]*|<<|>>|<[^<>]*>|[A-Za-z](?:[A-Za-z_-]*[A-Za-z])?|[{}]/g;
  const notes: LilypondNote[] = [];
  let pitchArguments = 0;
  for (let token = tokens.exec(masked); token; token = tokens.exec(masked)) {
    const value = token[0];
    if (value.startsWith("\\")) {
      pitchArguments = PITCH_ARGUMENTS[value] || 0;
      continue;
    }
    if (value === "{" || value === "}") {
      pitchArguments = 0;
      continue;
    }
    const chord =
      value.startsWith("<") && value !== "<<" && /[a-z]/.test(value);
    const pitched = chord || PITCH.test(value) || value === "q";
    if (!pitched && !/^[rsR]$/.test(value)) continue;
    if (pitchArguments) {
      pitchArguments--;
      continue;
    }
    if (/^\s*=(?![',])/.test(masked.slice(tokens.lastIndex))) continue;
    const suffix =
      /^(?:\s*[',])*(?:=[',]*)?[!?]?(?:\s*(?:\d+|\\(?:breve|longa|maxima)))?(?:\s*\.)*(?:\s*\*\s*\d+(?:\s*\/\s*\d+)?)*(?::\d+)?/.exec(
        masked.slice(tokens.lastIndex),
      )[0];
    const end = tokens.lastIndex + suffix.length;
    notes.push({ start: token.index, end, pitched });
    tokens.lastIndex = end;
  }
  return { notes, masked };
}
