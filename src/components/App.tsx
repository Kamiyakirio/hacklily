// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type * as monaco from "monaco-editor";
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import NativeRenderer, {
  encodeBytes,
  importMusicXML,
  openScore,
  openScorePath,
  prepareEngine,
  saveExport,
  saveScore,
  watchOpenRequests,
} from "#/lib/NativeRenderer";
import type { EngineProgress, ScoreFile } from "#/lib/NativeRenderer";

import type { EditorHandle, MakelilyProps } from "./Editor";
import Editor from "./Editor";
import EditorPreviewLayout from "./EditorPreviewLayout";
import type { ViewMode } from "./Header";
import Header, { MIN_BOTH_WIDTH, MODE_BOTH, MODE_VIEW } from "./Header";
import ModalAbout from "./ModalAbout";
import ModalFileAssociations from "./ModalFileAssociations";
import ModalUnsavedChangesInterstitial from "./ModalUnsavedChangesInterstitial";
import NewScoreWizard from "./NewScoreWizard";
import Preview from "./Preview";
import { Button } from "./ui/button";
import { useColourScheme } from "./useColourScheme";

const Makelily = lazy(() => import("./Makelily"));
const DRAFT_KEY = "hacklily.desktop.draft";
const WORD_WRAP_KEY = "hacklily.desktop.wordWrap";
const DEFAULT_SONG = `\\version "2.26.0"

\\header {
  title = "Untitled"
  composer = "Composer"
}

\\score {
  \\relative c' { c4 d e f }
  \\layout {}
  \\midi {}
}`;

interface Score {
  src: string;
  path: string | null;
  savedSrc: string;
  includeDir: string | null;
}
type Action =
  | "new"
  | "open"
  | "import"
  | "close"
  | { file: ScoreFile }
  | { newScore: string };

function newScore(): Score {
  return {
    src: DEFAULT_SONG,
    savedSrc: DEFAULT_SONG,
    path: null,
    includeDir: null,
  };
}

function readDraft(): Score {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (typeof draft?.src === "string" && typeof draft?.savedSrc === "string") {
      const path = typeof draft.path === "string" ? draft.path : null;
      return {
        src: draft.src,
        savedSrc: draft.savedSrc,
        path,
        includeDir:
          typeof draft.includeDir === "string"
            ? draft.includeDir
            : parentDirectory(path),
      };
    }
    const previous = JSON.parse(
      localStorage.getItem("dirtySong::null") || "null",
    );
    if (typeof previous?.src === "string")
      return { ...newScore(), src: previous.src };
  } catch {
    /* An invalid draft must not prevent the editor from opening. */
  }
  return newScore();
}

function parentDirectory(path: string | null) {
  if (!path) return null;
  return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
}

export default function App() {
  const [score, setScore] = useState(readDraft);
  const [mode, setMode] = useState<ViewMode>(() =>
    window.innerWidth >= MIN_BOTH_WIDTH ? MODE_BOTH : MODE_VIEW,
  );
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [wordWrap, setWordWrap] = useState(() => {
    try {
      return localStorage.getItem(WORD_WRAP_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [logs, setLogs] = useState<string | null>(null);
  const [midi, setMidi] = useState<ArrayBuffer | null>(null);
  const [compiledSource, setCompiledSource] = useState<string | null>(null);
  const [selection, setSelection] = useState<monaco.ISelection | null>(null);
  const [engine, setEngine] = useState<{
    ready: boolean;
    progress: EngineProgress | null;
    error: string | null;
    version: string | null;
  }>({ ready: false, progress: null, error: null, version: null });
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [about, setAbout] = useState(false);
  const [associations, setAssociations] = useState(false);
  const [newWizard, setNewWizard] = useState(false);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [tool, setTool] = useState<
    | (MakelilyProps & {
        name: string;
        callback?: (ly: string) => void;
        singleTask: boolean;
      })
    | null
  >(null);
  const editor = useRef<EditorHandle | null>(null);
  const colourScheme = useColourScheme();
  const renderer = useMemo(
    () => new NativeRenderer(score.includeDir),
    [score.includeDir],
  );
  const dirty = score.src !== score.savedSrc;
  const filename = score.path?.split(/[\\/]/).pop() || "Untitled.ly";
  const exportName = filename.replace(/\.ly$/i, "");
  const currentMidi = compiledSource === score.src ? midi : null;

  useEffect(() => () => renderer.cancel(), [renderer]);
  useEffect(() => {
    try {
      localStorage.setItem(WORD_WRAP_KEY, String(wordWrap));
    } catch {
      /* Wrapping still works when preferences cannot be saved. */
    }
  }, [wordWrap]);
  useEffect(() => {
    let active = true;
    void prepareEngine((progress) => {
      if (active) setEngine((previous) => ({ ...previous, progress }));
    })
      .then(({ version }) => {
        if (active)
          setEngine({ ready: true, progress: null, error: null, version });
      })
      .catch((cause) => {
        if (active)
          setEngine({
            ready: false,
            progress: null,
            error: String(cause),
            version: null,
          });
      });
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(score));
    } catch (cause) {
      console.warn("Could not save the local draft", cause);
    }
  }, [score]);

  useEffect(() => {
    // GitHub authentication is no longer part of the application.
    localStorage.removeItem("auth");
    sessionStorage.removeItem("csrf");
    sessionStorage.removeItem("csrfQueryParams");
    const resize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth >= MIN_BOTH_WIDTH) setMode(MODE_BOTH);
      else
        setMode((previous) => (previous === MODE_BOTH ? MODE_VIEW : previous));
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const title = `${dirty ? "* " : ""}${filename} — Hacklily`;
    document.title = title;
    if (isTauri()) void getCurrentWindow().setTitle(title);
  }, [dirty, filename]);

  function showMakelily(name = "notes", callback?: (ly: string) => void) {
    if (!editor.current) return;
    setTool({
      ...editor.current.getMakelilyProperties(),
      name,
      callback,
      singleTask: !!name,
    });
  }

  async function save(as = false): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const source = score.src;
    try {
      const path = await saveScore(source, as ? null : score.path);
      if (!path) return false;
      setScore((previous) => ({
        ...previous,
        path,
        savedSrc: source,
        includeDir: parentDirectory(path),
      }));
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function execute(action: Action) {
    setPendingAction(null);
    if (action === "close") {
      await getCurrentWindow().destroy();
      return;
    }
    if (typeof action === "object" && "newScore" in action) {
      setScore({
        src: action.newScore,
        savedSrc: "",
        path: null,
        includeDir: null,
      });
      setLogs(null);
      setMidi(null);
      setCompiledSource(null);
      setSelection(null);
      return;
    }
    if (action === "new") {
      setNewWizard(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const opening = action === "open" || typeof action === "object";
      const file =
        typeof action === "object"
          ? action.file
          : action === "open"
            ? await openScore()
            : await importMusicXML();
      if (!file) return;
      setScore({
        src: file.src,
        savedSrc: opening ? file.src : "",
        path: opening ? file.path : null,
        includeDir: parentDirectory(file.path),
      });
      setLogs(null);
      setMidi(null);
      setCompiledSource(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function request(action: Action) {
    if (busy) return;
    if (action === "new") {
      if (!pendingAction) setNewWizard(true);
      return;
    }
    if (dirty) setPendingAction(action);
    else void execute(action);
  }

  useEffect(
    () =>
      watchOpenRequests(
        (paths) => setOpenPaths((previous) => [...previous, ...paths]),
        (cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : typeof cause === "string"
                ? cause
                : JSON.stringify(cause),
          ),
      ),
    [],
  );
  const handleOpenedFile = useEffectEvent((file: ScoreFile) =>
    request({ file }),
  );
  useEffect(() => {
    if (busy || pendingAction || newWizard || !openPaths.length) return;
    let active = true;
    void openScorePath(openPaths[0])
      .then((file) => {
        if (!active) return;
        setOpenPaths((previous) => previous.slice(1));
        handleOpenedFile(file);
      })
      .catch((cause) => {
        if (!active) return;
        setOpenPaths((previous) => previous.slice(1));
        setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [openPaths, busy, pendingAction, newWizard]);

  async function exportFile(format: "pdf" | "midi" | "ly") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let content: string;
      if (format === "pdf") content = await renderer.renderPdf(score.src);
      else if (format === "midi") {
        if (!currentMidi)
          throw new Error(
            "Render the score with a \\midi {} block before exporting MIDI.",
          );
        content = encodeBytes(new Uint8Array(currentMidi));
      } else content = encodeBytes(new TextEncoder().encode(score.src));
      await saveExport(content, format, exportName);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  const handleClose = useEffectEvent((event: { preventDefault(): void }) => {
    if (dirty || busy) {
      event.preventDefault();
      request("close");
    }
  });
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (newWizard) {
      if (["s", "o", "n", "p"].includes(event.key.toLowerCase()))
        event.preventDefault();
      return;
    }
    switch (event.key.toLowerCase()) {
      case "s":
        event.preventDefault();
        void save(event.shiftKey);
        break;
      case "o":
        event.preventDefault();
        request("open");
        break;
      case "n":
        event.preventDefault();
        request("new");
        break;
      case "p":
        event.preventDefault();
        if (engine.ready) void exportFile("pdf");
        break;
    }
  });
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri())
      void getCurrentWindow()
        .onCloseRequested((event) => handleClose(event))
        .then((stop) => {
          if (disposed) stop();
          else unlisten = stop;
        });
    const keydown = (event: KeyboardEvent) => handleKey(event);
    window.addEventListener("keydown", keydown, true);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("keydown", keydown, true);
    };
  }, []);

  const progress = engine.progress;
  const percent = progress?.total
    ? Math.floor((progress.downloaded * 100) / progress.total)
    : null;
  return (
    <div className="App">
      <Header
        mode={mode}
        midi={currentMidi}
        windowWidth={windowWidth}
        wordWrap={wordWrap}
        onWordWrapChanged={setWordWrap}
        canExport={engine.ready && !busy}
        canSave={!busy}
        midiAvailable={!!currentMidi}
        onModeChanged={setMode}
        onShowMakelily={showMakelily}
        onShowNew={() => request("new")}
        onShowOpen={() => request("open")}
        onImportMusicXML={() => request("import")}
        onSave={() => void save()}
        onSaveAs={() => void save(true)}
        onShowAbout={() => setAbout(true)}
        onShowFileAssociations={() => setAssociations(true)}
        onInsertNotation={(code) => {
          if (mode === MODE_VIEW) setMode("edit");
          editor.current?.insertNotation(code);
        }}
        onExportLy={() => void exportFile("ly")}
        onExportPDF={() => void exportFile("pdf")}
        onExportMIDI={() => void exportFile("midi")}
      />
      {error && (
        <div
          role="alert"
          className="absolute top-12 inset-x-0 z-50 bg-destructive p-3 text-destructive-foreground whitespace-pre-wrap max-h-60 overflow-auto"
        >
          {error}
          <Button variant="outline" onClick={() => setError(null)}>
            Close
          </Button>
        </div>
      )}
      {busy && (
        <div
          role="status"
          className="absolute top-12 left-1/2 z-40 bg-background p-2"
        >
          Working…
        </div>
      )}
      <EditorPreviewLayout mode={mode} windowWidth={windowWidth}>
        <Editor
          ref={editor}
          code={score.src}
          colourScheme={colourScheme}
          wordWrap={wordWrap}
          onWordWrapChanged={setWordWrap}
          mode={mode}
          logs={logs}
          defaultSelection={selection}
          showMakelily={showMakelily}
          onSetCode={(src) => setScore((previous) => ({ ...previous, src }))}
        />
        {engine.ready ? (
          <Preview
            code={score.src}
            logs={logs}
            mode={mode}
            renderer={renderer}
            onLogsObtained={(value) => {
              setLogs(value);
              setCompiledSource(score.src);
            }}
            onMidiObtained={setMidi}
            onSelectionChanged={setSelection}
          />
        ) : (
          mode !== "edit" && (
            <div
              className="absolute inset-y-0 right-0 flex items-center justify-center p-8"
              style={{ left: mode === MODE_BOTH ? "var(--editor-width)" : 0 }}
            >
              <div role="status" className="text-center max-w-lg space-y-3">
                {engine.error ? (
                  <>
                    <p className="whitespace-pre-wrap" role="alert">
                      {engine.error}
                    </p>
                    <Button
                      onClick={() => {
                        setEngine({
                          ready: false,
                          progress: null,
                          error: null,
                          version: null,
                        });
                        setRetry((value) => value + 1);
                      }}
                    >
                      Retry
                    </Button>
                  </>
                ) : (
                  <>
                    <p>
                      {progress?.stage === "downloading"
                        ? `Downloading LilyPond${percent !== null ? ` ${percent}%` : "…"}`
                        : progress?.stage === "extracting"
                          ? "Installing LilyPond…"
                          : "Preparing LilyPond…"}
                    </p>
                    {progress?.stage === "downloading" && (
                      <progress
                        aria-label="LilyPond download"
                        max={progress.total || undefined}
                        value={progress.downloaded}
                        className="w-full"
                      />
                    )}
                    <p className="text-sm text-muted-foreground">
                      The first launch downloads the engine. After installation,
                      rendering works offline.
                    </p>
                  </>
                )}
              </div>
            </div>
          )
        )}
      </EditorPreviewLayout>
      {about && <ModalAbout onHide={() => setAbout(false)} />}
      {newWizard && (
        <NewScoreWizard
          onHide={() => setNewWizard(false)}
          onCreate={(source) => {
            setNewWizard(false);
            request({ newScore: source });
          }}
        />
      )}
      {associations && (
        <ModalFileAssociations onHide={() => setAssociations(false)} />
      )}
      {pendingAction && (
        <ModalUnsavedChangesInterstitial
          cancel={() => setPendingAction(null)}
          discardChanges={() => void execute(pendingAction)}
          save={() =>
            void save().then((saved) => {
              if (saved) void execute(pendingAction);
            })
          }
        />
      )}
      {tool && (
        <Suspense fallback={<div role="status">Loading note tools…</div>}>
          <Makelily
            clef={tool.makelilyClef}
            keySig={tool.makelilyKey}
            time={tool.makelilyTime}
            defaultTool={tool.name}
            singleTaskMode={tool.singleTask}
            onHide={() => setTool(null)}
            onInsertLy={(ly) => {
              if (tool.callback) tool.callback(ly);
              else editor.current?.insertText(ly);
              setTool(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
