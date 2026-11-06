// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { TriangleAlert } from "lucide-react";
import type * as monacoEditor from "monaco-editor";
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { initAnalytics, track, trackPageview } from "#/lib/analytics";
import type { Auth } from "#/lib/auth";
import { checkLogin, revokeGitHubAuth } from "#/lib/auth";
import {
  cat,
  FileNotFound,
  getDefaultBranch,
  getOrCreateRepo,
} from "#/lib/gitfs";
import { renderVersionFor } from "#/lib/lilypondVersion";
import type { Song } from "#/lib/localStorage";
import type RPCClient from "#/lib/RPCClient";
import RpcSvgRenderer from "#/lib/RpcSvgRenderer";
import { mergeState } from "#/lib/state";
import { useRpcConnection } from "#/lib/useRpcConnection";
import { cn } from "#/lib/utils";
import WasmRenderer from "#/lib/WasmRenderer";

import type { EditorHandle } from "./Editor";
import Editor from "./Editor";
import type { ViewMode } from "./Header";
import Header, { MIN_BOTH_WIDTH, MODE_BOTH, MODE_VIEW } from "./Header";
import Modal404 from "./Modal404";
import ModalAbout from "./ModalAbout";
import ModalConflict from "./ModalConflict";
import ModalLocked, {
  lock,
  setEditingNotificationHandler,
} from "./ModalLocked";
import ModalLogin from "./ModalLogin";
import ModalOpen from "./ModalOpen";
import ModalPublish, { doPublish, doUnpublish } from "./ModalPublish";
import ModalSaving from "./ModalSaving";
import ModalUnsavedChangesInterstitial from "./ModalUnsavedChangesInterstitial";
import Preview from "./Preview";
import { APP_STYLE } from "./styles";

const Makelily = lazy(() => import("#/components/Makelily"));

function last<T>(t: T[]): T {
  return t[t.length - 1];
}

const INITIAL_WS_COOLOFF = 2;
const BACKEND_WS_URL: string | undefined = process.env.REACT_APP_BACKEND_WS_URL;
const PUBLIC_READONLY = "PUBLIC_READONLY";

/**
 * Properties derived from URL.
 *
 * e.g., https://www.hacklily.org/?edit=hacklily/user-emilyskidsister/test.ly =>
 *   {
 *     edit: 'hacklily/user-emilyskidsister/test.ly',
 *   }
 *
 * NOTE: When you add a key here, also add it to QUERY_PROP_KEYS below.
 */
export interface QueryProps {
  /**
   * Truthy if this was redirected from a 404 page.
   */
  "404"?: string;

  /*
   * Truthy if we should show the about page.
   */
  about?: string;

  /**
   * When logging in from GitHub, code is the temporary code that will be exchanged via
   * the backend for an access token.
   *
   * See also 'state'.
   *
   * See https://developer.github.com/v3/oauth/
   */
  code?: string;

  /**
   * The song being edited, with the following format:
   *
   *   `${org}/${repo}/${song}.ly`
   *
   * If it is undefined, Hacklily will act as a sandbox.
   */
  edit?: string;

  /**
   * If truthy, and we are authenticated, show a dialog to save a
   * copy of this song.
   */
  saveAs?: string;

  /**
   * When set, open a read-only sandbox with this code.
   * Takes precedence over "edit".
   */
  src?: string;

  /**
   * When logging in from GitHub, this is the CSRF, generated in ConnectToGitHub.
   *
   * See also 'code'.
   *
   * See https://developer.github.com/v3/oauth/.
   */
  state?: string;
}

export const QUERY_PROP_KEYS: Array<keyof QueryProps> = [
  "404",
  "about",
  "code",
  "edit",
  "saveAs",
  "src",
  "state",
];

interface Props extends QueryProps {
  /**
   * From localStorage, information about the current GitHub user.
   */
  auth: Auth | null;

  /**
   * Based on media query.
   */
  colourScheme: "dark" | "light";

  /**
   * From localStorage, used as part of the GitHub OAuth flow.
   */
  csrf: string;

  /**
   * From localStorage, all songs that have changes not pushed to GitHub.
   */
  dirtySongs: { [key: string]: Song };

  /**
   * True if the warning that is shown when unstable LilyPond is used should be shown.
   */
  hideUnstableNotification: boolean;

  /**
   * Mark a song as dirty and store it in localStorage.
   */
  editSong(songID: string, song: Song): void;

  /**
   * Remove a song from dirtySongs. This can be either because the song is now
   * clean, or because the local changes have been discarded. Updates localStorage.
   */
  markSongClean(song: string): void;

  /**
   * Logs in or out of GitHub. Updates localStorage.
   */
  setAuth(auth: Auth | null): void;

  /**
   * Sets the CSRF ("state") as part of the GitHub OAuth flow.
   */
  setCSRF(csrf: string): void;

  /**
   * Sets whether the warning that is shown when LilyPond 2.23 is used should be shown.
   */
  setHideUnstableNotification(hideUnstableNotification: boolean): void;

  /**
   * Updates a field in the URL query.
   */
  setQuery<K extends keyof QueryProps>(
    updates: Pick<QueryProps, K>,
    replaceState?: boolean,
  ): void;

  /**
   * Which renderer backs the SVG preview. "server" uses the JSON-RPC WebSocket
   * (the historical path); "wasm" engraves locally in a lilypond-wasm Web
   * Worker, with the WebSocket still used for auth/publish/PDF.
   */
  variant: "server" | "wasm";
}

interface State {
  cleanSongs: { [key: string]: Song };
  defaultSelection: monacoEditor.ISelection | null;
  interstitialChanges: {} | null;

  /**
   * True if we started editing this song in another tab.
   */
  locked: boolean;
  login: boolean;
  logs: string | null;
  makelilyClef: string;
  makelilyKey: string;
  makelilySingleTaskMode: boolean;
  makelilyTime: string;
  makelilyTool: string;
  midi: ArrayBuffer | null;
  mode: ViewMode;
  pendingPreviews: number;
  publish: boolean;
  rendererVersion: "stable" | "unstable";
  open: boolean;
  saving: boolean;
  showMakelily: boolean;
  windowWidth: number;
  branch: string | null;

  /**
   * (wasm only) True once the lilypond-wasm worker has signaled ready. The
   * preview gates on this independently of the WebSocket on /wasm.
   */
  wasmReady: boolean;

  /**
   * (wasm only) Non-null when the worker has crashed and is being recycled;
   * cleared once it boots again.
   */
  wasmError: string | null;

  makelilyInsertCB?(ly: string): void;
}

const DEFAULT_SONG = `\\version "${
  process.env.REACT_APP_STABLE_LILYPOND_VERSION || "2.26.0"
}"

\\header {
  title = "Untitled"
  composer = "Composer"
}

\\score {
  \\relative c' {
    c4
  }

  \\layout {}
  \\midi {}
}`;

/**
 * Root component of Hacklily. This renders everything on the page.
 *
 * Receives props from the query (URL) as well as localStorage -- see index.tsx for how that works.
 */
export default function App(props: Props) {
  const { setQuery } = props;
  const [state, updateState] = useReducer(
    mergeState<State>,
    undefined,
    (): State => ({
      cleanSongs: {
        null: {
          baseSHA: null,
          src: DEFAULT_SONG,
        },
      },
      defaultSelection: null,
      interstitialChanges: null,
      locked: false,
      login: false,
      logs: "",
      makelilyClef: "treble",
      makelilyKey: "c \\major",
      makelilySingleTaskMode: true,
      makelilyTime: "4/4",
      makelilyTool: "notes",
      midi: null,
      mode: window.innerWidth >= MIN_BOTH_WIDTH ? MODE_BOTH : MODE_VIEW,
      pendingPreviews: 0,
      publish: false,
      rendererVersion: "stable",
      open: false,
      saving: false,
      showMakelily: false,
      windowWidth: window.innerWidth,
      branch: null,
      wasmReady: false,
      wasmError: null,
    }),
  );

  const editorRef = useRef<EditorHandle | null>(null);
  const { rpc, connecting, wsError, reconnectTimeout } = useRpcConnection(
    BACKEND_WS_URL,
    INITIAL_WS_COOLOFF,
  );
  const connectionActive = connecting || !!rpc;
  const [wasmRenderer, setWasmRenderer] = useState<WasmRenderer | null>(null);
  const rpcRenderer = useMemo(
    () => (rpc ? new RpcSvgRenderer(rpc) : null),
    [rpc],
  );
  const svgRenderer = props.variant === "wasm" ? wasmRenderer : rpcRenderer;

  useEffect(() => {
    if (props.variant !== "wasm") return;
    const renderer = new WasmRenderer({
      onReady: () => {
        setWasmRenderer(renderer);
        updateState({ wasmReady: true, wasmError: null });
      },
      onCrash: (message: string) =>
        updateState({ wasmReady: false, wasmError: message }),
    });
    return () => renderer.destroy();
  }, [props.variant]);

  function cancelInterstitial(): void {
    updateState({
      interstitialChanges: null,
    });
  }

  function discardChanges(): void {
    if (!state.interstitialChanges) {
      throw new Error("Invariant violation");
    }
    const edit: string = props.edit || "null";
    props.markSongClean(edit);
    props.setQuery(state.interstitialChanges);
    updateState({
      interstitialChanges: null,
    });
  }

  async function fetchSong(signal: AbortSignal): Promise<void> {
    const { auth, edit } = props;
    if (!edit || edit === "null") return;
    const parts = edit.split("/");
    const repo = parts.slice(0, 2).join("/");
    const filename = parts.slice(2).join("/");
    const isOwner = !!auth && auth.repo === repo;
    updateState({ branch: null });
    try {
      const branch = await getDefaultBranch(
        isOwner ? auth.accessToken : null,
        repo,
      );
      if (signal.aborted) return;
      let content: string;
      let baseSHA: string;
      if (isOwner) {
        const file = await cat(auth.accessToken, repo, filename);
        content = file.content;
        baseSHA = file.sha;
      } else {
        const response = await fetch(
          `https://raw.githubusercontent.com/${repo}/${branch}/${filename}`,
          { signal },
        );
        if (response.status >= 400) {
          track("song-not-found");
          alert("Could not fetch the requested song.");
          return;
        }
        content = await response.text();
        baseSHA = PUBLIC_READONLY;
      }
      if (signal.aborted) return;
      updateState((previous) => ({
        branch,
        cleanSongs:
          !isOwner && previous.cleanSongs[edit]
            ? previous.cleanSongs
            : {
                ...previous.cleanSongs,
                [edit]: { baseSHA, src: content },
              },
      }));
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof FileNotFound) {
        track("song-not-found");
        props.setQuery({ edit: undefined, src: undefined, 404: "1" });
      }
    }
  }

  function getSongName(): string {
    const songParts: string[] = props.edit
      ? props.edit.split("/")
      : ["untitled"];
    return songParts[songParts.length - 1];
  }

  function handleBeforeUnload(ev: BeforeUnloadEvent): void {
    // Don't bug users when going to GitHub OAuth
    if (state.login) {
      return;
    }

    // Don't bug users when they have no choice
    if (state.locked) {
      return;
    }

    if (isDirty()) {
      updateState({
        interstitialChanges: null,
      });
      ev.returnValue = "Changes you made have not been saved.";
    }
  }

  function handleClear404(): void {
    props.setQuery({
      404: undefined,
    });
  }

  function handleCodeChanged(newValue: string): void {
    const { baseSHA, src: clean } = state.cleanSongs[props.edit || "null"];
    if (clean === newValue) {
      props.markSongClean(props.edit || "null");
    } else {
      props.editSong(props.edit || "null", {
        baseSHA,
        src: newValue,
      });
    }
  }

  async function handleDeleteSong(songID: string): Promise<void> {
    try {
      updateState({
        saving: true,
      });
      const { auth } = props;
      if (!auth || !rpc) {
        throw new Error("Invariant violation: contract broken");
      }
      const path: string = last(songID.split("/"));

      const ok: boolean = await doUnpublish(auth, path, rpc);

      if (ok) {
        track("github/delete");
        const cleanSongs: { [key: string]: Song } = JSON.parse(
          JSON.stringify(state.cleanSongs),
        );
        delete cleanSongs[songID];
        updateState({
          cleanSongs,
        });
        props.markSongClean(songID);
        props.setQuery({
          edit: undefined,
          src: undefined,
        });
      }
    } finally {
      updateState({
        saving: false,
      });
    }
  }

  function handleEditingNotification(song: string): void {
    if (song === (props.edit || "null")) {
      updateState({
        locked: true,
      });
    }
  }

  function handleExportMIDI(): void {
    const { midi } = state;
    if (!midi) {
      alert(
        "No MIDI data found. Make sure you have " +
          "a \\midi {} and a \\layout {} in your \\score {}.",
      );
      return;
    }

    track("export/midi");
    const name = getSongName();
    const blob = new Blob([midi], { type: "audio/midi" });
    const src = URL.createObjectURL(blob);

    triggerDownload(`${name}.midi`, src);
  }

  async function handleExportPDF(): Promise<void> {
    const song = getSong();
    if (!song) {
      alert("Could not export PDF.");
      return;
    }

    const activeRpc = rpc;
    if (!activeRpc) {
      alert("Could not connect to server");
      return;
    }

    // TODO TRIGGER LOADING

    const name = getSongName();

    try {
      const version = renderVersionFor(song.src);

      const pdf: string = (
        await activeRpc.call("render", {
          version,
          backend: "pdf",
          src: song.src,
        })
      ).result.files[0];

      console.log(pdf);

      track("export/pdf");
      triggerDownload(`${name}.pdf`, "data:text/plain;base64," + pdf);
    } catch (_err) {
      alert("Could not export PDF.");
    }

    return;
  }

  function handleExportLy(): void {
    const song = getSong();
    if (!song) {
      alert("Could not export lilypond source.");
      return;
    }

    track("export/ly");
    const name = getSongName();
    triggerDownload(
      `${name}.ly`,
      "data:text/plain;charset=utf-8," + encodeURIComponent(song.src),
    );
  }

  function handleHideHelp(): void {
    props.setQuery({
      about: undefined,
    });
  }

  function handleHideOpen(): void {
    updateState({
      open: false,
    });
  }

  function handleHideLogin(): void {
    updateState({
      login: false,
    });
  }

  function handleHideMakelily(): void {
    updateState({
      makelilyInsertCB: undefined,
      showMakelily: false,
    });
  }

  function handleHidePublish(): void {
    if (props.saveAs) {
      props.setQuery({
        saveAs: undefined,
      });
    } else {
      updateState({
        publish: false,
      });
    }
    if (state.interstitialChanges) {
      cancelInterstitial();
    }
  }

  function handleHideUnstableNotification(): void {
    props.setHideUnstableNotification(true);
  }

  function handleInsertLy(ly: string): void {
    if (editorRef.current) {
      if (state.makelilyInsertCB) {
        state.makelilyInsertCB(`${ly}\n`);
      } else {
        editorRef.current.insertText(`\n${ly}\n`);
      }
    }
    updateState({
      makelilyInsertCB: undefined,
      showMakelily: false,
    });
  }

  function handleLoadSong(edit: string): void {
    setQueryOrShowInterstitial({
      edit,
      src: undefined,
    });
    updateState({
      open: false,
    });
  }

  function handleLogsObtained(
    logs: string | null,
    version: "stable" | "unstable",
  ): void {
    if (logs !== state.logs || version !== state.rendererVersion) {
      updateState({
        logs,
        rendererVersion: version,
      });
    }
  }

  function handleMidiObtained(midi: ArrayBuffer | null): void {
    if (midi !== state.midi) {
      updateState({
        midi,
      });
    }
  }

  function handleModeChanged(mode: ViewMode): void {
    updateState({
      mode,
    });
  }

  function handlePublished(edit: string): void {
    props.markSongClean("null");
    if (state.interstitialChanges) {
      props.setQuery(state.interstitialChanges);
      updateState({
        interstitialChanges: null,
      });
    } else {
      props.setQuery({
        edit,
        saveAs: undefined,
        src: undefined,
      });
    }

    updateState({
      publish: false,
    });

    if (!rpc) {
      throw new Error("Expected rpc to be defined");
    }

    void rpc.call("notifySaved", {});
  }

  function handleResolveGitHub(): void {
    if (!props.edit) {
      // The sandbox can't have conflicts.
      throw new Error("Expected us to be editing a published song");
    }
    props.markSongClean(props.edit);
  }

  function handleResolveLocalStorage(): void {
    if (!props.edit) {
      // The sandbox can't have conflicts.
      throw new Error("Expected us to be editing a published song");
    }

    props.editSong(props.edit, {
      baseSHA: state.cleanSongs[props.edit].baseSHA,
      src: getSong().src,
    });
  }

  function handleSelectionChanged(
    selection: monacoEditor.ISelection | null,
  ): void {
    if (selection !== state.defaultSelection) {
      updateState({
        defaultSelection: selection,
      });
    }
  }

  function handleShowHelp(): void {
    props.setQuery({
      about: "1",
    });
  }

  function handleShowOpen(): void {
    updateState({
      open: true,
    });
  }

  async function handleShowMakelily(
    tool?: string,
    cb?: (ly: string) => void,
  ): Promise<void> {
    const editor: EditorHandle | null = editorRef.current;
    if (!editor) {
      return;
    }

    await import("#/components/Makelily");

    track(`makelily/${tool || state.makelilyTool}`);
    updateState({
      showMakelily: true,
      ...editor.getMakelilyProperties(),
      makelilyInsertCB: cb,
      makelilySingleTaskMode: !!tool,
      makelilyTool: tool || state.makelilyTool,
    });
  }

  function handleShowNew(): void {
    setQueryOrShowInterstitial({
      edit: undefined,
      src: undefined,
    });
  }

  function handleShowPublish(): void {
    if (!props.auth) {
      updateState({
        login: true,
      });
    } else if (props.edit) {
      void handleUpdateGitHub();
    } else {
      updateState({
        publish: true,
      });
    }
  }

  function handleShowSaveAs(): void {
    if (!props.auth) {
      updateState({
        login: true,
      });
      props.setQuery(
        {
          saveAs: "1",
        },
        // HACK: replace because going back in history won't clear the login modal
        true,
      );
    } else {
      props.setQuery({
        saveAs: "1",
      });
    }
  }

  function handleSignIn(): void {
    updateState({
      login: true,
      publish: false,
    });
  }

  function handleSignOut(): void {
    const { auth } = props;

    if (!rpc) {
      alert("Cannot sign out because you are not connected to the server.");

      return;
    }

    props.setAuth(null);

    if (!auth) {
      throw new Error("Cannot sign out because we are not signed in.");
    }
    const token: string = auth.accessToken;
    localStorage.clear();
    void revokeGitHubAuth(rpc, token);
  }

  async function handleUpdateGitHub(): Promise<void> {
    try {
      updateState({
        saving: true,
      });
      const song: Song | undefined = getSong();
      const { auth, edit } = props;
      if (!auth || !edit || !song || !rpc) {
        throw new Error("Invariant violation: contract broken");
      }
      const path: string = last(edit.split("/"));

      try {
        await doPublish(song.src, auth, path, rpc, true);
        track("github/save");
        const cleanSongs: { [key: string]: Song } = JSON.parse(
          JSON.stringify(state.cleanSongs),
        );
        cleanSongs[edit] = {
          baseSHA: song.baseSHA,
          src: song.src,
        };
        updateState({
          cleanSongs,
        });
        props.markSongClean(edit);
      } catch (err) {
        alert(String(err));
      }

      if (!rpc) {
        throw new Error("Expected rpc to be defined");
      }

      await rpc.call("notifySaved", {});
    } finally {
      updateState({
        saving: false,
      });
      if (state.interstitialChanges) {
        props.setQuery(state.interstitialChanges);
        updateState({
          interstitialChanges: null,
        });
      }
    }
  }

  function hasConflict(): boolean {
    const { dirtySongs, edit } = props;
    const { cleanSongs } = state;
    const songName: string = edit || "null";

    const dirtySong: Song | undefined = dirtySongs[songName];
    const cleanSong: Song | undefined = cleanSongs[songName];

    return dirtySong && cleanSong && dirtySong.baseSHA !== cleanSong.baseSHA;
  }

  function isDirty(): boolean {
    const { edit, dirtySongs, src } = props;

    if (src) {
      return false;
    }

    return dirtySongs[edit || "null"] !== undefined;
  }

  function isOnline(): boolean {
    return Boolean(rpc);
  }

  function renderModal() {
    const {
      locked,
      login,
      publish,
      interstitialChanges,
      saving,
      showMakelily,
      open,
    } = state;

    const { about, auth, csrf, setCSRF, "404": _404, saveAs } = props;

    const song: Song | undefined = getSong();
    const conflict: boolean = hasConflict();

    switch (true) {
      case locked:
        return <ModalLocked />;
      case _404 !== undefined:
        return <Modal404 onHide={handleClear404} />;
      case saving:
        return <ModalSaving />;
      case conflict:
        return (
          <ModalConflict
            resolveGitHub={handleResolveGitHub}
            resolveLocalStorage={handleResolveLocalStorage}
          />
        );
      case login:
        return (
          <ModalLogin
            key={location.href /* force new csrf on url change */}
            onHide={handleHideLogin}
            csrf={csrf}
            setCSRF={setCSRF}
          />
        );
      case Boolean(about):
        return <ModalAbout onHide={handleHideHelp} />;
      case publish || Boolean(saveAs):
        if (song && auth && rpc) {
          return (
            <ModalPublish
              onHide={handleHidePublish}
              onPublished={handlePublished}
              auth={auth}
              code={song.src}
              rpc={rpc}
            />
          );
        }

        return null;
      case interstitialChanges !== null:
        return (
          <ModalUnsavedChangesInterstitial
            discardChanges={discardChanges}
            cancel={cancelInterstitial}
            save={handleShowPublish}
          />
        );
      case open:
        return (
          <ModalOpen
            auth={auth}
            onSignIn={handleSignIn}
            onDeleteSong={handleDeleteSong}
            onLoadSong={handleLoadSong}
            onHide={handleHideOpen}
          />
        );
      case showMakelily: {
        return (
          <Suspense fallback={<div role="status">Loading tools?</div>}>
            <Makelily
              clef={state.makelilyClef}
              defaultTool={state.makelilyTool}
              keySig={state.makelilyKey}
              onHide={handleHideMakelily}
              singleTaskMode={state.makelilySingleTaskMode}
              onInsertLy={handleInsertLy}
              time={state.makelilyTime}
            />
          </Suspense>
        );
      }
      default:
        return null;
    }
  }

  function renderPreview() {
    const { mode, logs, wasmReady, wasmError } = state;
    const { variant } = props;

    const song: Song | undefined = getSong();

    const online: boolean = isOnline();
    if (!song) {
      return (
        <div
          className={cn(
            APP_STYLE.sheetMusicView,
            mode === MODE_BOTH
              ? "w-1/2"
              : mode === MODE_VIEW
                ? "w-full"
                : "w-0",
          )}
        >
          <div className={cn(APP_STYLE.sheetMusicError)}>
            Fetching sheet music&hellip;
          </div>
        </div>
      );
    }

    if (variant === "wasm") {
      // The wasm worker is the preview source and is independent of the
      // WebSocket (used only for auth/publish/PDF on /wasm), so the WS
      // connect/reconnect state never blocks the preview here.
      if (wasmReady && svgRenderer) {
        return (
          <Preview
            code={song.src}
            mode={mode}
            onLogsObtained={handleLogsObtained}
            onMidiObtained={handleMidiObtained}
            onSelectionChanged={handleSelectionChanged}
            renderer={svgRenderer}
            logs={logs}
          />
        );
      }
      return (
        <div
          className={cn(
            APP_STYLE.sheetMusicView,
            mode === MODE_BOTH
              ? "w-1/2"
              : mode === MODE_VIEW
                ? "w-full"
                : "w-0",
          )}
        >
          <div className={cn(APP_STYLE.sheetMusicError)}>
            {wasmError ? (
              <>
                <TriangleAlert size="1em" className="inline" /> LilyPond worker
                crashed ({wasmError}); restarting&hellip;
              </>
            ) : (
              <>Booting LilyPond&hellip;</>
            )}
          </div>
        </div>
      );
    }

    if (connectionActive) {
      if (online && svgRenderer) {
        return (
          <Preview
            code={song.src}
            mode={mode}
            onLogsObtained={handleLogsObtained}
            onMidiObtained={handleMidiObtained}
            onSelectionChanged={handleSelectionChanged}
            renderer={svgRenderer}
            logs={logs}
          />
        );
      }

      const previewMaskStyle: string = cn(
        APP_STYLE.pendingPreviewMask,
        mode === MODE_VIEW && APP_STYLE.previewPendingMaskModeView,
      );

      return (
        <span>
          <div
            className={cn(
              APP_STYLE.sheetMusicView,
              mode === MODE_BOTH
                ? "w-1/2"
                : mode === MODE_VIEW
                  ? "w-full"
                  : "w-0",
            )}
          />
          <div className={previewMaskStyle} />
        </span>
      );
    }

    if (!BACKEND_WS_URL) {
      return (
        <div
          className={cn(
            APP_STYLE.sheetMusicView,
            mode === MODE_BOTH
              ? "w-1/2"
              : mode === MODE_VIEW
                ? "w-full"
                : "w-0",
          )}
        >
          <div className={cn(APP_STYLE.sheetMusicError)}>
            Could not connect to server because the{" "}
            <code>REACT_APP_BACKEND_WS_URL</code> environment variable was not
            set during bundling.
          </div>
        </div>
      );
    }

    if (wsError) {
      return (
        <div
          className={cn(
            APP_STYLE.sheetMusicView,
            mode === MODE_BOTH
              ? "w-1/2"
              : mode === MODE_VIEW
                ? "w-full"
                : "w-0",
          )}
        >
          <div className={cn(APP_STYLE.sheetMusicError, "flex flex-col")}>
            <TriangleAlert size="1em" className="self-center" /> Could not
            connect to server. Trying again in {reconnectTimeout}
            &hellip;
          </div>
        </div>
      );
    }

    return null;
  }

  function setQueryOrShowInterstitial<K extends keyof QueryProps>(
    updates: Pick<QueryProps, K>,
  ): void {
    if (isDirty()) {
      updateState({
        interstitialChanges: updates,
      });
    } else {
      props.setQuery(updates);
    }
  }

  function getSong(): Song | undefined {
    const { dirtySongs, edit, src } = props;

    if (src) {
      return {
        baseSHA: PUBLIC_READONLY,
        src,
      };
    }

    const { cleanSongs } = state;
    const songName: string = edit || "null";

    const song: Song | undefined = dirtySongs[songName] || cleanSongs[songName];
    if (!song) {
      return undefined;
    }

    return song;
  }

  function triggerDownload(filename: string, src: string) {
    const element = document.createElement("a");
    element.setAttribute("href", src);
    element.setAttribute("download", filename);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  const opened = useEffectEvent(
    async (client: RPCClient, isActive: () => boolean) => {
      if (props.code && props.state) {
        try {
          const auth = await checkLogin(
            client,
            props.code,
            props.state,
            props.csrf,
          );
          auth.repoDetails = await getOrCreateRepo(auth);
          if (!isActive()) return;
          props.setAuth(auth);
          track("github/connect");
          props.setQuery({ code: undefined, state: undefined }, true);
        } catch (err) {
          if (!isActive()) return;
          alert(err.message || "Could not log you in");
          props.setQuery({ code: undefined, state: undefined }, true);
        }
      } else if (props.auth) {
        try {
          const auth = { ...props.auth };
          auth.repoDetails = await getOrCreateRepo(auth);
          if (isActive()) props.setAuth(auth);
        } catch (err) {
          if (isActive())
            alert(err.message || "Could not get GitHub repo details.");
        }
      }
    },
  );
  useEffect(() => {
    if (!rpc) return;
    let active = true;
    void opened(rpc, () => active);
    return () => {
      active = false;
    };
  }, [rpc]);

  const beforeUnload = useEffectEvent((ev: BeforeUnloadEvent) =>
    handleBeforeUnload(ev),
  );
  const editingNotification = useEffectEvent((song: string) =>
    handleEditingNotification(song),
  );
  const initializeAnalytics = useEffectEvent(() => {
    initAnalytics();
    trackPageview("/", "Hacklily");
    if (props.edit) track("load-link");
    else if (props.src) track("load-src");
  });
  useEffect(() => {
    initializeAnalytics();
    const unload = (ev: BeforeUnloadEvent) => beforeUnload(ev);
    const editing = (song: string) => editingNotification(song);
    const resize = () =>
      updateState((previous) => ({
        windowWidth: window.innerWidth,
        mode:
          window.innerWidth >= MIN_BOTH_WIDTH
            ? MODE_BOTH
            : previous.mode === MODE_BOTH
              ? MODE_VIEW
              : previous.mode,
      }));
    window.addEventListener("resize", resize);
    window.addEventListener("beforeunload", unload);
    setEditingNotificationHandler(editing);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("beforeunload", unload);
      setEditingNotificationHandler(null);
    };
  }, []);

  const loadSong = useEffectEvent((signal: AbortSignal) => fetchSong(signal));
  useEffect(() => {
    const controller = new AbortController();
    lock(props.edit || "null");
    void loadSong(controller.signal);
    return () => controller.abort();
  }, [props.edit, props.auth]);

  useEffect(() => {
    if (!props.auth && !state.login && !props.state && props.saveAs) {
      setQuery({ saveAs: undefined }, true);
    }
  }, [props.auth, props.state, props.saveAs, setQuery, state.login]);

  const { logs, mode, midi, defaultSelection, rendererVersion, windowWidth } =
    state;

  const { auth, edit, hideUnstableNotification } = props;

  const online: boolean = isOnline();
  const preview = renderPreview();
  const song: Song | undefined = getSong();
  const sandboxIsDirty: boolean =
    Boolean(props.edit || props.src) && Boolean(props.dirtySongs.null);

  let songURL: string | null = null;
  if (props.edit && state.branch) {
    const songParts: string[] = props.edit.split("/");
    songURL = `https://github.com/${songParts[0]}/${songParts[1]}/blob/${
      state.branch
    }/${songParts.slice(2).join("/")}`;
  }

  const header = (
    <Header
      onDeleteSong={handleDeleteSong}
      onLoadSong={handleLoadSong}
      onShowAbout={handleShowHelp}
      onSignIn={handleSignIn}
      onSignOut={handleSignOut}
      auth={auth}
      mode={mode}
      midi={midi}
      online={online}
      loggedIn={auth !== null}
      onModeChanged={handleModeChanged}
      onShowClone={handleShowSaveAs}
      onShowMakelily={handleShowMakelily}
      onShowNew={handleShowNew}
      onShowOpen={handleShowOpen}
      onShowPublish={handleShowPublish}
      sandboxIsDirty={sandboxIsDirty}
      song={props.src ? "untitled-import" : edit}
      inSandbox={!props.edit && !props.src}
      isDirty={isDirty()}
      readOnly={
        Boolean(props.src) || (song ? song.baseSHA === PUBLIC_READONLY : false)
      }
      windowWidth={windowWidth}
      canExport={Boolean(online && rpc && logs && state.pendingPreviews === 0)}
      onExportLy={handleExportLy}
      onExportMIDI={handleExportMIDI}
      onExportPDF={handleExportPDF}
      songURL={songURL}
    />
  );

  return (
    <div className="App">
      {header}
      {renderModal()}
      <div className="content">
        <Editor
          ref={editorRef}
          variant={props.variant}
          code={song ? song.src : undefined}
          colourScheme={props.colourScheme}
          mode={mode}
          hideUnstableNotification={hideUnstableNotification}
          onSetCode={handleCodeChanged}
          onHideUnstableNotification={handleHideUnstableNotification}
          logs={logs}
          defaultSelection={defaultSelection}
          readOnly={song ? song.baseSHA === PUBLIC_READONLY : false}
          isImmutableSrc={Boolean(props.src)}
          showMakelily={handleShowMakelily}
          rendererVersion={rendererVersion}
        />
        {preview}
      </div>
    </div>
  );
}
