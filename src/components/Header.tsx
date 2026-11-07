// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import {
  ChevronDown,
  Eye,
  FastForward,
  File as FileIcon,
  Music,
  Pause,
  PenLine,
  Play,
  Rewind,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useReducer, useRef, useState } from "react";

import FileMenu from "#/components/FileMenu";
import { Button } from "#/components/ui/button";
import { ButtonGroup } from "#/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Separator } from "#/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { track } from "#/lib/analytics";
import { mergeState } from "#/lib/state";
import { cn } from "#/lib/utils";

import logoSvg from "./logo.svg";

export type ViewMode = "view" | "edit" | "both";
export const MODE_VIEW: ViewMode = "view";
export const MODE_BOTH: ViewMode = "both";
export const MODE_EDIT: ViewMode = "edit";
export const MIN_BOTH_WIDTH = 630;
export const MIN_REASONABLE_WIDTH = 470;

interface Player {
  // TODO(jocelyn): Export hackmidi types :(
  addChangeListener(
    fn: (timeInSeconds: number, isPlaying: boolean) => void,
  ): void;
  destroy(): void;
  getDuration(): number;
  pause(): void;
  play(): void;
  removeChangeListener(
    fn: (timeInSeconds: number, isPlaying: boolean) => void,
  ): void;
  seek(time: number): void;
}

interface Props {
  canExport: boolean;
  canSave: boolean;
  midiAvailable: boolean;
  midi: ArrayBuffer | null;
  mode: ViewMode;
  windowWidth: number;
  onModeChanged(mode: ViewMode): void;
  onShowMakelily(tool: string): void;
  onShowNew(): void;
  onShowOpen(): void;
  onExportLy(): any;
  onExportMIDI(): any;
  onExportPDF(): any;
  onSave(): void;
  onSaveAs(): void;
  onImportMusicXML(): void;
  onShowAbout(): void;
  onShowFileAssociations(): void;
}

interface State {
  // The interface changes after we've played once.
  played: boolean;
  midi: ArrayBuffer | null;
  playing: boolean;
  timeInSeconds: number;
}

/**
 * Renders the top of the app.
 */
export default function Header(props: Props) {
  const [state, updateState] = useReducer(mergeState<State>, {
    played: false,
    playing: false,
    timeInSeconds: 0,
    midi: props.midi,
  });
  const playerRef = useRef<Player | null>(null);
  const [requestedMidi, requestPlayback] = useState<ArrayBuffer | null>(null);
  const playing = state.midi === props.midi && state.playing;

  useEffect(() => {
    if (!requestedMidi || requestedMidi !== props.midi) return;
    let active = true;
    let released = false;
    let player: Player | null = null;
    let wasPlaying = false;

    function release() {
      if (released || !player) return;
      released = true;
      const currentPlayer = player;
      currentPlayer.removeChangeListener(changed);
      if (playerRef.current === currentPlayer) playerRef.current = null;
      // The player finishes its notification before Timidity is released.
      queueMicrotask(() => currentPlayer.destroy());
    }

    function changed(timeInSeconds: number, isPlaying: boolean) {
      if (!active || released) return;
      updateState({ playing: isPlaying, timeInSeconds, midi: requestedMidi });
      if (wasPlaying && !isPlaying && timeInSeconds === 0) {
        release();
        requestPlayback(null);
      }
      wasPlaying = isPlaying;
    }

    async function load() {
      try {
        const { playerFromMIDIBuffer } = await import("hackmidi");
        player = await playerFromMIDIBuffer(
          requestedMidi,
          "/hackmidi/samples/",
        );
        if (!active) {
          release();
          return;
        }
        playerRef.current = player;
        player.addChangeListener(changed);
        player.play();
        wasPlaying = true;
        updateState({ played: true, playing: true, midi: requestedMidi });
      } catch (error) {
        if (active) {
          console.error("Could not start MIDI playback", error);
          requestPlayback(null);
          updateState({ playing: false });
        }
      }
    }
    void load();
    return () => {
      active = false;
      release();
    };
  }, [props.midi, requestedMidi]);

  function handlePause() {
    updateState({ playing: false });
    playerRef.current?.pause();
  }
  function handlePlay() {
    if (!props.midi) {
      alert(
        "No MIDI data found. Make sure you have a \\midi {} and a \\layout {} in your \\score {}.",
      );
      return;
    }
    track("midi-playback");
    if (playerRef.current) {
      playerRef.current.play();
      updateState({ played: true, playing: true, midi: props.midi });
    } else requestPlayback(props.midi);
  }

  function handleFastForward(): void {
    if (!playerRef.current) {
      return;
    }
    playerRef.current.seek(state.timeInSeconds + 4);
  }

  function handleSetView(): void {
    props.onModeChanged(MODE_VIEW);
  }

  function handleSetEdit(): void {
    props.onModeChanged(MODE_EDIT);
  }

  function handleRewind(): void {
    if (!playerRef.current) {
      return;
    }
    playerRef.current.seek(Math.max(0, state.timeInSeconds - 4));
  }

  function handleShowClef(): void {
    props.onShowMakelily("clef");
  }

  function handleShowKey(): void {
    props.onShowMakelily("key");
  }

  function handleShowTime(): void {
    props.onShowMakelily("time");
  }

  function handleShowNotes(): void {
    props.onShowMakelily("notes");
  }

  function renderTime() {
    const { timeInSeconds } = state;
    const { windowWidth } = props;
    let fmtTime = String(Math.floor(timeInSeconds * 100) / 100);
    if (fmtTime.split(".")[1] == null) {
      fmtTime += ".00";
    }
    while (fmtTime.split(".")[1].length < 2) {
      fmtTime += "0";
    }

    return (
      <>
        <Button
          title="Rewind"
          variant="outline"
          size="icon"
          onClick={handleRewind}
        >
          <Rewind size="1em" className="inline" />
        </Button>
        <Button
          title={playing ? "Pause" : "Play"}
          variant="outline"
          size="icon"
          onClick={playing ? handlePause : handlePlay}
        >
          {playing ? (
            <Pause size="1em" className="inline" />
          ) : (
            <Play size="1em" className="inline" />
          )}
        </Button>
        {windowWidth >= MIN_REASONABLE_WIDTH && (
          <Button
            className={cn("text-left w-20 justify-end", "font-mono")}
            variant="outline"
            disabled
          >
            {fmtTime}
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          title="Fast-forward"
          onClick={handleFastForward}
        >
          <FastForward size="1em" className="inline" />
        </Button>
      </>
    );
  }

  const {
    canExport,
    canSave,
    midiAvailable,
    mode,
    midi,
    onExportLy,
    onExportMIDI,
    onExportPDF,
    onShowAbout,
    onShowFileAssociations,
    onShowOpen,
    onShowNew,
    onSave,
    onSaveAs,
    onImportMusicXML,
    windowWidth,
  } = props;
  const { played } = state;

  const viewMode = windowWidth < MIN_BOTH_WIDTH && (
    <>
      <Button
        onClick={handleSetView}
        variant={mode === MODE_VIEW ? "default" : "outline"}
        size="icon"
      >
        <Eye size="1em" className="inline" />
      </Button>
      <Button
        onClick={handleSetEdit}
        variant={mode === MODE_EDIT ? "default" : "outline"}
        size="icon"
      >
        <PenLine size="1em" className="inline" />
      </Button>
    </>
  );

  let playButton: ReactNode = (
    <Button
      onClick={playing ? handlePause : handlePlay}
      variant="outline"
      disabled={!midi}
    >
      {playing ? (
        <Pause size="1em" className="inline" />
      ) : (
        <Play size="1em" className="inline" />
      )}
      {playing ? "Pause" : "Play"}
    </Button>
  );

  if (!midi) {
    playButton = (
      <Tooltip>
        <TooltipTrigger render={playButton} />
        <TooltipContent side="top">
          {
            "No MIDI data found. Make sure you have a \\midi {} and a \\layout {} in your \\score {}."
          }
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <header className="header flex h-12 items-center gap-4 border-b px-4">
      <div className="flex items-center align gap-2">
        {windowWidth >= MIN_REASONABLE_WIDTH && (
          <img src={logoSvg} className="mr-4 py-2.25 scale-x-[-1] w-8" alt="" />
        )}
        {windowWidth >= MIN_BOTH_WIDTH && (
          <div className="text-[16px] -ml-2 mr-3.75">Hacklily</div>
        )}
        {windowWidth >= MIN_BOTH_WIDTH && (
          <Separator orientation="vertical" className="h-6 self-center!" />
        )}
        <ButtonGroup>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <FileIcon size="1em" className="inline" />
              {windowWidth >= MIN_REASONABLE_WIDTH && <span>File</span>}
              <ChevronDown size="1em" className="inline" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-48">
              <FileMenu
                canSave={canSave}
                midiAvailable={midiAvailable}
                canExport={canExport}
                onExportLy={onExportLy}
                onExportMIDI={onExportMIDI}
                onExportPDF={onExportPDF}
                onShowAbout={onShowAbout}
                onShowFileAssociations={onShowFileAssociations}
                onShowOpen={onShowOpen}
                onSave={onSave}
                onSaveAs={onSaveAs}
                onImportMusicXML={onImportMusicXML}
                onShowNew={onShowNew}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          {windowWidth >= MIN_BOTH_WIDTH && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                <PenLine size="1em" className="inline" />
                Insert
                <ChevronDown size="1em" className="inline" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-48">
                <DropdownMenuItem onClick={handleShowClef}>
                  Clef&hellip;
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShowKey}>
                  Key Signature&hellip;
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShowTime}>
                  Time Signature&hellip;
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShowNotes}>
                  <Music size="1em" className="inline" />
                  Notes&hellip;
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {viewMode}
          {played && midi != null ? renderTime() : playButton}
        </ButtonGroup>
      </div>
    </header>
  );
}
