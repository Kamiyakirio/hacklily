import type { editor } from "monaco-editor";

export function intervalShortcut(
  event: Pick<
    KeyboardEvent,
    "code" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey"
  >,
): { interval: number; direction: 1 | -1 } | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  // Option can change event.key into £, ¡, €, etc. The physical code stays put.
  const digit = /^(?:Digit|Numpad)([1-8])$/.exec(event.code);
  return digit
    ? { interval: Number(digit[1]), direction: event.shiftKey ? -1 : 1 }
    : null;
}

export function registerIntervalShortcuts(
  editorInstance: Pick<editor.IStandaloneCodeEditor, "onKeyDown">,
  onInterval: (interval: number, direction: 1 | -1) => void,
) {
  return editorInstance.onKeyDown((event) => {
    const shortcut = intervalShortcut(event.browserEvent);
    if (!shortcut) return;
    event.preventDefault();
    event.stopPropagation();
    onInterval(shortcut.interval, shortcut.direction);
  });
}
