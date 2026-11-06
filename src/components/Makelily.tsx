// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import type { ComponentType, ErrorInfo } from "react";
import { useEffect, useState } from "react";

import { parseClef, parseKeySig, parseTime } from "#/lib/parseLy";
import { Application, requireFont } from "#/satie/src/satie";

import { cn } from "../lib/utils";
import ErrorBoundary from "./ErrorBoundary";
import ToolError from "./MakelilyError";
import ToolNoteEdit from "./MakelilyNoteEdit";
import ToolNotFound from "./MakelilyNotFound";
import ToolSetClef from "./MakelilySetClef";
import ToolSetKey from "./MakelilySetKey";
import ToolSetTime from "./MakelilySetTime";
import type { MakelilyToolProps } from "./MakelilyToolProps";

export const satieApplication: Application = new Application({
  preloadedFonts: ["Alegreya", "Alegreya (bold)"],
  satieRoot: `${location.protocol}//${location.host}/vendor/`,
});

requireFont("Bravura", "root://bravura/otf/Bravura.otf");

interface InsertMode {
  Component: ComponentType<MakelilyToolProps>;
  key: string;
  name: string;
}

const modes: InsertMode[] = [
  {
    Component: ToolSetClef,
    key: "clef",
    name: "Set Clef",
  },
  {
    Component: ToolSetKey,
    key: "key",
    name: "Set Key Signature",
  },
  {
    Component: ToolSetTime,
    key: "time",
    name: "Set Time Signature",
  },
  {
    Component: ToolNoteEdit,
    key: "notes",
    name: "Insert Notes",
  },
  {
    Component: ToolError,
    key: "error",
    name: null,
  },
];

export interface Props {
  clef: string;
  defaultTool: string;
  keySig: string;
  singleTaskMode: boolean;
  time: string;
  onHide(): void;
  onInsertLy(ly: string): void;
}

export interface State {
  toolKey: string;
}

/**
 * A modal which provides UIs for inserting LilyPond.
 */
export default function Makelily({ onHide, ...props }: Props) {
  const [toolKey, setToolKey] = useState(props.defaultTool || "clef");
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onHide();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onHide]);
  function handleToolError(error: Error, info: ErrorInfo) {
    console.warn("Caught error", error, info);
    setToolKey("error");
  }

  const modeElements = modes
    .filter((mode: InsertMode) => mode.name !== null)
    .map((mode: InsertMode, i: number) => {
      const className: string = cn(
        styles.modeItem,
        i + 1 === modes.length && styles.modeItemLast,
        mode.key === toolKey && styles.modeItemSelected,
      );

      return (
        <li
          className={className}
          onClick={(): void => setToolKey(mode.key)}
          role="button"
          key={mode.key}
        >
          {mode.name}
        </li>
      );
    });

  const activeMode: InsertMode = modes.find(
    (mode: InsertMode) => mode.key === toolKey,
  );
  const Tool: ComponentType<MakelilyToolProps> = activeMode
    ? activeMode.Component
    : ToolNotFound;

  const bar = !props.singleTaskMode ? (
    <div className={cn(styles.modeBar)}>
      <h2 className={cn(styles.heading)}>LilyPond Tools</h2>
      <ul className={cn(styles.modeList)}>{modeElements}</ul>
    </div>
  ) : null;

  const contentClass: string = cn(
    styles.content,
    props.singleTaskMode && styles.contentNoBar,
  );

  return (
    <>
      <div
        role="button"
        aria-label="close"
        className={cn(styles.modalBg)}
        onClick={onHide}
      />
      <div className={cn(styles.modal)}>
        {bar}
        <div className={contentClass}>
          <ErrorBoundary
            key={toolKey}
            fallback={<ToolError />}
            onError={handleToolError}
          >
            <Tool
              clef={parseClef(props.clef)}
              keySig={parseKeySig(props.keySig)}
              time={parseTime(props.time)}
              onInsertLy={props.onInsertLy}
            />
          </ErrorBoundary>
        </div>
        <a href="#" onClick={onHide} role="button" className={cn(styles.close)}>
          {"\u00d7"}
        </a>
      </div>
    </>
  );
}

const styles = {
  close:
    "text-[#6e6e6e] text-[22px] absolute right-[15px] no-underline top-[22px] hover:text-black",
  content: "absolute inset-y-0 left-[180px] right-0",
  contentNoBar: "left-0",
  heading: "cursor-default text-[18px] mb-0 mt-2 pb-4 pl-4 pt-4",
  modal:
    "bg-background border border-solid border-[grey] rounded-[4px] h-[600px] left-[calc(50%-1020px/2)] overflow-hidden fixed top-[calc((50%-600px/2)*2/3)] w-[1020px] z-[1001]",
  modalBg: "bg-black absolute inset-0 cursor-pointer opacity-40 fixed z-[1000]",
  modeBar: "bg-[#F6F7F7] absolute inset-y-0 left-0 w-[180px]",
  modeItem:
    "border-t border-[#D6D8DA] cursor-pointer text-[15px] px-4 py-2 hover:underline",
  modeItemLast: "border-b border-[#D6D8DA]",
  modeItemSelected:
    "cursor-default font-bold hover:text-black hover:no-underline",
  modeList: "list-none m-0 p-0",
} as const;
