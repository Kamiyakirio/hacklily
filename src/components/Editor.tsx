// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import * as monacoEditor from "monaco-editor";
import type { Ref } from "react";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMonacoEditor from "react-monaco-editor";

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
  selectAll(): void;
}

interface Props {
  ref?: Ref<EditorHandle>;
  code: string | undefined;

  colourScheme: "dark" | "light";

  /**
   * When this changes, the selection changes. Used so that when you click on a
   * note in the preview, it highlights where the note is defined in the editor.
   */
  defaultSelection: monacoEditor.ISelection | null;

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

  function handleEditorWillMount(monacoModule: typeof monacoEditor): void {
    if (registeredMonacoComponents) {
      return;
    }
    registeredMonacoComponents = true;

    monacoModule.languages.register({ id: "lilypond" });
    monacoModule.languages.setLanguageConfiguration("lilypond", {
      comments: { lineComment: "%", blockComment: ["%{", "%}"] },
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
    selectAll,
  }));

  useEffect(() => {
    editorInstance?.layout();
  }, [editorInstance, props.mode]);
  useEffect(() => {
    if (!editorInstance || !props.defaultSelection) return;
    editorInstance.setSelection(props.defaultSelection);
    editorInstance.revealLineInCenter(
      props.defaultSelection.selectionStartLineNumber,
    );
    editorInstance.focus();
  }, [editorInstance, props.defaultSelection]);
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
      autoClosingBrackets: "always",
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
