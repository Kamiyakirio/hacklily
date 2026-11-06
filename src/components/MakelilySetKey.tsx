// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useReducer } from "react";

import { mergeState } from "#/lib/state";
import type { Clef, Key } from "#/musicxml-interfaces";
import { Addons as SatieAddons } from "#/satie/src/satie";

import { cn } from "../lib/utils";
import makelilyStyles from "./makelilyStyles";
import type { MakelilyToolProps } from "./MakelilyToolProps";

const keyViewbox = "-2 -40 80 80";

const trebleClef: Clef = {
  line: 2,
  sign: "G",
};

const majors = "cgdaebFCGDAEBfcgda";
function getEnglish(fifths: number, mode: "major" | "minor"): string {
  const englishMode: string = mode === "major" ? "major" : "minor";

  const key: string = majors[fifths + 7 + (mode === "minor" ? 3 : 0)];
  if (!key) {
    return "Unknown";
  }
  if (key.toLowerCase() === key) {
    if (fifths < 0) {
      // It's flat.
      return `${key.toUpperCase()}\u266D ${englishMode}`;
    } else {
      return `${key.toUpperCase()}\u266F ${englishMode}`;
    }
  }

  return `${key.toUpperCase()} ${englishMode}`;
}

function getLy(fifths: number, mode: "major" | "minor"): string {
  const key: string = majors[fifths + 7 + (mode === "minor" ? 3 : 0)];
  if (!key) {
    return "Unknown";
  }
  if (key.toLowerCase() === key) {
    if (fifths < 0) {
      // It's flat.
      return `\\key ${key.toLowerCase()}es \\${mode}`;
    } else {
      return `\\key ${key.toLowerCase()}is \\${mode}`;
    }
  }

  return `\\key ${key.toLowerCase()} \\${mode}`;
}

const stdKeys: { [mode: string]: Key[] } = {
  major: Array(15)
    .fill(null)
    .map((_: null, i: number) => ({
      fifths: i - 7,
      mode: "major",
    })),
  minor: Array(15)
    .fill(null)
    .map((_: null, i: number) => ({
      fifths: i - 7,
      mode: "minor",
    })),
};

export interface State {
  selectedKey: number;
  selectedMode: "major" | "minor";
}

function getInitialState(props: MakelilyToolProps): State {
  let selectedKey = 8;
  let selectedMode: "major" | "minor" = "major";

  if (props.keySig.mode === "minor") {
    selectedMode = "minor";
  }

  selectedKey = parseInt(String(props.keySig.fifths), 10) + 7;

  return {
    selectedKey,
    selectedMode,
  };
}

/**
 * A tool which allows a key to be inserted.
 */
export default function ToolSetKey(props: MakelilyToolProps) {
  const [state, updateState] = useReducer(
    mergeState<State>,
    undefined,
    (): State => getInitialState(props),
  );

  function generateLy(): string {
    return getLy(stdKeys.major[state.selectedKey].fifths, state.selectedMode);
  }

  function handleInsertLyClicked(): void {
    props.onInsertLy(generateLy());
  }

  const ksViews = stdKeys.major.map((key: Key, i: number) => {
    const keySpec: Key = {
      defaultX: 0,
      defaultY: 0,
      relativeY: 0,
      ...key,
    };

    const selected: boolean = i === state.selectedKey;

    return (
      <span
        className={cn(
          makelilyStyles.selectableOption,
          selected && makelilyStyles.selectableSelected,
        )}
        role="button"
        onClick={(): void => updateState({ selectedKey: i })}
        key={i}
      >
        <svg className={cn(makelilyStyles.resetFont)} viewBox={keyViewbox}>
          <SatieAddons.KeySignature clef={trebleClef} spec={keySpec} />
        </svg>
        <span className={cn(makelilyStyles.selectableDescription)}>
          {getEnglish(key.fifths, state.selectedMode)}
        </span>
      </span>
    );
  });

  return (
    <div className={cn(makelilyStyles.tool)}>
      <div className={cn(makelilyStyles.section)}>
        <h3 className={cn(makelilyStyles.toolHeading)}>Key Signature</h3>
        <div className={cn(makelilyStyles.selectableList)}>{ksViews}</div>
      </div>
      <div className={cn(makelilyStyles.section)}>
        <h3 className={cn(makelilyStyles.toolHeading)}>Mode</h3>
        <form className={cn(makelilyStyles.radioGroup)}>
          <div>
            <input
              id="key-mode-major"
              type="radio"
              checked={state.selectedMode === "major"}
              aria-checked={state.selectedMode === "major"}
              onChange={(): void => updateState({ selectedMode: "major" })}
            />{" "}
            <label htmlFor="key-mode-major">Major (M)</label>
          </div>
          <div>
            <input
              id="key-mode-minor"
              type="radio"
              checked={state.selectedMode === "minor"}
              aria-checked={state.selectedMode === "minor"}
              onChange={(): void => updateState({ selectedMode: "minor" })}
            />{" "}
            <label htmlFor="key-mode-minor">Minor (m)</label>
          </div>
        </form>
      </div>
      <div className={cn(makelilyStyles.spacer)} />
      <div className={cn(makelilyStyles.section)}>
        <pre className={cn(makelilyStyles.lyPreview)}>{generateLy()}</pre>

        <button
          className={cn(makelilyStyles.insert)}
          onClick={handleInsertLyClicked}
        >
          Insert this code into Hacklily
        </button>
      </div>
    </div>
  );
}
