// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import * as monacoEditor from "monaco-editor";
import type { Ref } from "react";
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMonacoEditor from "react-monaco-editor";

import { applyMusicNotationToRanges } from "#/lib/applyMusicNotation";
import { registerIntervalShortcuts } from "#/lib/intervalShortcuts";
import { readLilypondNotes } from "#/lib/lilypondSource";
import type { MusicNotation } from "#/lib/musicNotations";
import { stackNoteIntervals } from "#/lib/stackNoteIntervals";
import { cn } from "#/lib/utils";
import CodelensProvider from "#/monacoConfig/CodelensProvider";
import Commands from "#/monacoConfig/Commands";
import LILYPOND_COMPLETION_ITEM_PROVIDER from "#/monacoConfig/LILYPOND_COMPLETION_ITEM_PROVIDER";
import LILYPOND_MONARCH_PROVIDER from "#/monacoConfig/LILYPOND_MONARCH_PROVIDER";

import type { ViewMode } from "./Header";
import { MODE_EDIT, MODE_VIEW } from "./Header";
import { APP_STYLE } from "./styles";

let registeredMonacoComponents = false;

export interface MakelilyProps {
  makelilyClef: string;
  makelilyKey: string;
  makelilyTime: string;
}

export interface EditorHandle {
  find(): void;
  findNext(): void;
  getMakelilyProperties(): MakelilyProps;
  insertText(text: string): void;
  insertNotation(text: string): void;
  getSelectedNoteCount(): number;
  applyNotation(notation: MusicNotation): boolean;
  selectAll(): void;
  selectNotes(selections: monacoEditor.ISelection[]): void;
}

interface Props {
  ref?: Ref<EditorHandle>;
  code: string | undefined;

  colourScheme: "dark" | "light";
  wordWrap: boolean;
  onWordWrapChanged(enabled: boolean): void;

  /**
   * Reports source selections so the preview follows the editor as well.
   */
  onSelectionChanged?(selections: monacoEditor.ISelection[]): void;

  /**
   * Lilypond logs -- used to render errors
   */
  logs: string | null;

  /**
   * Whether we're visible, half-screen, or hidden.
   */
  mode: ViewMode;

  /**
   * Called when an edit occurs. <Editor /> is a controlled component.
   */
  onSetCode(newCode: string): void;
  onSelectedNotesChanged?(count: number): void;

  showMakelily(tool?: string, cb?: (ly: string) => void): void;
}

/**
 * Renders the left-hand side of the App UI. This is a small wrapper around monaco.
 *
 * It is a controlled component, and parses the passed logs to render errors.
 */
export default function Editor({ ref, ...props }: Props) {
  const [editorInstance, setEditorInstance] =
    useState<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const lensRegistration = useRef<monacoEditor.IDisposable | null>(null);

  const [commands] = useState(() => new Commands(() => {}));
  useLayoutEffect(() => {
    commands.setShowMakelily(props.showMakelily);
  }, [commands, props.showMakelily]);

  function handleEditorDidMount(
    editor: monacoEditor.editor.IStandaloneCodeEditor,
  ) {
    editor.focus();
    setEditorInstance(editor);
    commands.init(editor);
    lensRegistration.current?.dispose();
    lensRegistration.current = monacoEditor.languages.registerCodeLensProvider(
      "lilypond",
      new CodelensProvider(commands),
    );
    editor.updateOptions({ wordBasedSuggestions: "off" });
  }

  function handleEditorWillUnmount() {
    lensRegistration.current?.dispose();
    lensRegistration.current = null;
  }

  function find(): void {
    if (editorInstance) {
      editorInstance.trigger("host", "actions.find", undefined);
    }
  }

  function findNext(): void {
    if (editorInstance) {
      editorInstance.trigger(
        "host",
        "editor.action.nextMatchFindAction",
        undefined,
      );
    }
  }

  function getMakelilyProperties(): MakelilyProps {
    const timeRegex = /\\time.*/g;
    const clefRegex = /\\clef.*/g;
    const keyRegex = /\\key.*/g;
    const code: string = props.code || "";
    function extractFirst(match: RegExpMatchArray | null): string | null {
      if (match) {
        return match[0];
      }

      return null;
    }
    function extractLast(match: RegExpMatchArray | null): string | null {
      if (match) {
        return match[match.length - 1];
      }

      return null;
    }
    const meta: MakelilyProps = {
      makelilyClef: (
        extractFirst(code.match(clefRegex)) || "\\clef treble"
      ).replace("\\clef ", ""),
      makelilyKey: (
        extractFirst(code.match(keyRegex)) || "\\key c \\major"
      ).replace("\\key ", ""),
      makelilyTime: (
        extractFirst(code.match(timeRegex)) || "\\time 4/4"
      ).replace("\\time ", ""),
    };

    if (!editorInstance) {
      return meta;
    }

    let codeBeforeCursor = "";
    const lines: string[] = code.split("\n");
    const line: monacoEditor.Position | null = editorInstance.getPosition();

    if (line) {
      for (let i = 0; i < line.lineNumber - 1; i += 1) {
        codeBeforeCursor += `${lines[i]}\n`;
      }
      codeBeforeCursor += lines[line.lineNumber - 1].slice(0, line.column);
    }

    meta.makelilyClef = (
      extractLast(codeBeforeCursor.match(clefRegex)) || meta.makelilyClef
    ).replace("\\clef ", "");
    meta.makelilyKey = (
      extractLast(codeBeforeCursor.match(keyRegex)) || meta.makelilyKey
    ).replace("\\key ", "");
    meta.makelilyTime = (
      extractLast(codeBeforeCursor.match(timeRegex)) || meta.makelilyTime
    ).replace("\\time ", "");

    return meta;
  }

  function insertText(text: string): void {
    if (!editorInstance) {
      return;
    }

    const line: monacoEditor.Position | null = editorInstance.getPosition();
    if (line) {
      const range: monacoEditor.Range = new monacoEditor.Range(
        line.lineNumber,
        1,
        line.lineNumber,
        1,
      );
      const op: monacoEditor.editor.IIdentifiedSingleEditOperation = {
        forceMoveMarkers: true,
        range,
        text,
      };
      editorInstance.executeEdits("hacklily", [op]);
    }
  }

  function selectAll(): void {
    if (editorInstance) {
      editorInstance.trigger("host", "editor.action.selectAll", undefined);
    }
  }

  function selectNotes(selections: monacoEditor.ISelection[]): void {
    if (!editorInstance) return;
    if (selections.length) {
      editorInstance.setSelections(selections);
      editorInstance.revealLineInCenter(selections[0].selectionStartLineNumber);
      editorInstance.focus();
    } else if (editorInstance.getPosition())
      editorInstance.setPosition(editorInstance.getPosition());
  }

  function insertNotation(text: string): void {
    const model = editorInstance?.getModel();
    const selection = editorInstance?.getSelection();
    if (!model || !selection) return;
    const start = model.getOffsetAt(selection.getStartPosition());
    const end = model.getOffsetAt(selection.getEndPosition());
    const source = model.getValue();
    const before = start > 0 && !/\s/.test(source[start - 1]) ? " " : "";
    const after = end < source.length && !/\s/.test(source[end]) ? " " : "";
    const inserted = `${before}${text}${after}`;
    editorInstance.pushUndoStop();
    editorInstance.executeEdits("music-notation", [
      { range: selection, text: inserted },
    ]);
    editorInstance.setPosition(model.getPositionAt(start + inserted.length));
    editorInstance.pushUndoStop();
    editorInstance.revealPositionInCenterIfOutsideViewport(
      editorInstance.getPosition(),
    );
    restoreEditorFocus();
  }

  function getSelectedNoteCount(): number {
    const model = editorInstance?.getModel();
    const selections = editorInstance?.getSelections() || [];
    if (!model || selections.every((selection) => selection.isEmpty()))
      return 0;
    const ranges = selections.map((selection) => ({
      start: model.getOffsetAt(selection.getStartPosition()),
      end: model.getOffsetAt(selection.getEndPosition()),
    }));
    return readLilypondNotes(model.getValue()).notes.filter(
      (note) =>
        note.pitched &&
        ranges.some(
          (range) =>
            range.start < range.end &&
            note.start < range.end &&
            note.end > range.start,
        ),
    ).length;
  }

  function applyNotation(notation: MusicNotation): boolean {
    const model = editorInstance?.getModel();
    const selections = editorInstance?.getSelections();
    if (!model || !selections?.length) return false;
    const source = model.getValue();
    const result = applyMusicNotationToRanges(
      source,
      selections.map((selection) => ({
        start: model.getOffsetAt(selection.getStartPosition()),
        end: model.getOffsetAt(selection.getEndPosition()),
      })),
      notation,
    );
    if (!result.applied) return false;
    if (result.edits.length) {
      editorInstance.pushUndoStop();
      editorInstance.executeEdits(
        "apply-music-notation",
        result.edits.map((change) => ({
          range: monacoEditor.Range.fromPositions(
            model.getPositionAt(change.start),
            model.getPositionAt(change.end),
          ),
          text: change.text,
        })),
        () =>
          result.selections.map((selection, index) => {
            const newStart = model.getPositionAt(selection.start);
            const newEnd = model.getPositionAt(selection.end);
            const backwards =
              selections[index].getDirection() ===
              monacoEditor.SelectionDirection.RTL;
            return monacoEditor.Selection.fromPositions(
              backwards ? newEnd : newStart,
              backwards ? newStart : newEnd,
            );
          }),
      );
      editorInstance.pushUndoStop();
    }
    restoreEditorFocus();
    return true;
  }

  function restoreEditorFocus() {
    // Allow a view-mode change to reveal the editor before restoring focus.
    requestAnimationFrame(() => {
      if (editorInstance.getDomNode()?.isConnected) editorInstance.focus();
    });
  }

  function handleEditorWillMount(monacoModule: typeof monacoEditor): void {
    if (registeredMonacoComponents) {
      return;
    }
    registeredMonacoComponents = true;

    monacoModule.languages.register({ id: "lilypond" });
    const brackets = LILYPOND_MONARCH_PROVIDER.brackets.map(
      ({ open, close }): [string, string] => [open, close],
    );
    monacoModule.languages.setLanguageConfiguration("lilypond", {
      comments: { lineComment: "%", blockComment: ["%{", "%}"] },
      brackets,
      colorizedBracketPairs: brackets,
      // Matching should not introduce automatic closers while typing hairpins.
      autoClosingPairs: [],
    });
    monacoModule.languages.setMonarchTokensProvider(
      "lilypond",
      LILYPOND_MONARCH_PROVIDER,
    );
    monacoModule.languages.registerCompletionItemProvider(
      "lilypond",
      LILYPOND_COMPLETION_ITEM_PROVIDER,
    );
  }

  useImperativeHandle(ref, () => ({
    find,
    findNext,
    getMakelilyProperties,
    insertText,
    insertNotation,
    getSelectedNoteCount,
    applyNotation,
    selectAll,
    selectNotes,
  }));

  useEffect(() => {
    editorInstance?.layout();
  }, [editorInstance, props.mode]);
  useEffect(() => {
    // Fast Refresh can keep an editor alive while its language rules change.
    if (editorInstance) handleEditorWillMount(monacoEditor);
  }, [editorInstance]);
  const addInterval = useEffectEvent((interval: number, direction: 1 | -1) => {
    const model = editorInstance?.getModel();
    const selections = editorInstance?.getSelections();
    if (!model || !selections?.length) return;
    const result = stackNoteIntervals(
      model.getValue(),
      selections.map((selection) => ({
        start: model.getOffsetAt(selection.getStartPosition()),
        end: model.getOffsetAt(selection.getEndPosition()),
      })),
      interval,
      direction,
    );
    if (!result.edits.length) return;
    editorInstance.pushUndoStop();
    editorInstance.executeEdits(
      "stack-note-interval",
      result.edits.map((edit) => ({
        range: monacoEditor.Range.fromPositions(
          model.getPositionAt(edit.start),
          model.getPositionAt(edit.end),
        ),
        text: edit.text,
      })),
      () =>
        result.selections.map((selection, index) => {
          const start = model.getPositionAt(selection.start);
          const end = model.getPositionAt(selection.end);
          const backwards =
            selections[index].getDirection() ===
            monacoEditor.SelectionDirection.RTL;
          return monacoEditor.Selection.fromPositions(
            backwards ? end : start,
            backwards ? start : end,
          );
        }),
    );
    editorInstance.pushUndoStop();
  });
  useEffect(() => {
    if (!editorInstance) return;
    const intervals = Array.from({ length: 8 }, (_, index) => index + 1);
    const actions = intervals.flatMap((interval) =>
      ([1, -1] as const).map((direction) =>
        editorInstance.addAction({
          id: `score.stackInterval.${direction === 1 ? "above" : "below"}.${interval}`,
          label: `Add interval ${interval} ${direction === 1 ? "above" : "below"} the highest note`,
          precondition: "editorTextFocus",
          run: () => addInterval(interval, direction),
        }),
      ),
    );
    const keyboard = registerIntervalShortcuts(
      editorInstance,
      (interval, direction) => addInterval(interval, direction),
    );
    return () => {
      keyboard.dispose();
      actions.forEach((action) => action.dispose());
    };
  }, [editorInstance]);
  const reportSelectedNotes = useEffectEvent(() => {
    props.onSelectedNotesChanged?.(getSelectedNoteCount());
    props.onSelectionChanged?.(editorInstance?.getSelections() || []);
  });
  useEffect(() => {
    if (!editorInstance) return;
    reportSelectedNotes();
    const selectionListener = editorInstance.onDidChangeCursorSelection(() =>
      reportSelectedNotes(),
    );
    const contentListener = editorInstance.onDidChangeModelContent(() =>
      reportSelectedNotes(),
    );
    return () => {
      selectionListener.dispose();
      contentListener.dispose();
    };
  }, [editorInstance]);
  const toggleWordWrap = useEffectEvent(() =>
    props.onWordWrapChanged(!props.wordWrap),
  );
  useEffect(() => {
    if (!editorInstance) return;
    const action = editorInstance.addAction({
      id: "editor.action.toggleWordWrap",
      label: "Toggle Word Wrap",
      keybindings: [monacoEditor.KeyMod.Alt | monacoEditor.KeyCode.KeyZ],
      run: () => toggleWordWrap(),
    });
    return () => action.dispose();
  }, [editorInstance]);
  useEffect(() => {
    if (!editorInstance) return;
    const logs = props.logs;

    const errors: monacoEditor.editor.IModelDeltaDecoration[] = [];
    const matchErrors = /hacklily\.ly:(\d+):(\d+):\s*(.*)/g;
    if (logs) {
      for (
        let error: RegExpExecArray | null = matchErrors.exec(logs);
        error;
        error = matchErrors.exec(logs)
      ) {
        errors.push({
          options: {
            hoverMessage: {
              isTrusted: false,
              value: error[3],
            },
            inlineClassName: "lilymonaco-inline-error",
            linesDecorationsClassName: cn(APP_STYLE.errorDecoration),
          },
          range: {
            endColumn: Math.max(1, parseInt(error[2], 10)) + 1,
            endLineNumber: parseInt(error[1], 10),
            startColumn: Math.max(1, parseInt(error[2], 10)),
            startLineNumber: parseInt(error[1], 10),
          },
        });
      }
    }

    const decorations = editorInstance.createDecorationsCollection(errors);
    return () => decorations.clear();
  }, [editorInstance, props.logs]);

  const { code, mode, onSetCode } = props;
  const monacoOptions: monacoEditor.editor.IStandaloneEditorConstructionOptions =
    {
      automaticLayout: true,
      wordWrap: props.wordWrap ? "on" : "off",
      autoClosingBrackets: "always",
      matchBrackets: "always",
      bracketPairColorization: { enabled: true },
      minimap: {
        enabled: false,
      },

      selectionHighlight: false,
    };

  const width = mode === MODE_EDIT ? "100%" : "var(--editor-width, 50%)";

  if (code === null || code === undefined) {
    return null;
  }

  return (
    <div
      className={cn("monaco", mode === MODE_VIEW && APP_STYLE.monacoHidden)}
      style={{ width }}
    >
      <ReactMonacoEditor
        editorDidMount={handleEditorDidMount}
        editorWillMount={handleEditorWillMount}
        editorWillUnmount={handleEditorWillUnmount}
        height="100%"
        language="lilypond"
        onChange={onSetCode}
        options={monacoOptions}
        theme={props.colourScheme === "dark" ? "vs-dark" : "vs"}
        value={code}
        width="100%"
      />
    </div>
  );
}
