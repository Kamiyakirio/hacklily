// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
import {
  find,
  findIndex,
  first,
  forEach,
  isEqual,
  last,
  reduce,
  some,
  times,
} from "lodash";
import { Info } from "lucide-react";
import type { KeyboardEvent, UIEvent } from "react";
import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";

import { mergeState } from "#/lib/state";
import type {
  Articulations,
  Attributes,
  Direction,
  DirectionType,
  Dot,
  Dynamics,
  Fermata,
  Key,
  Notations,
  Note,
  Pitch,
  Technical,
  TimeModification,
} from "#/musicxml-interfaces";
import {
  AboveBelow,
  BarStyleType,
  Count,
  MxmlAccidental,
  NormalAngledSquare,
} from "#/musicxml-interfaces";
import type {
  IBarlineBuilder,
  IBarStyleBuilder,
  INoteBuilder,
  ITypeBuilder,
} from "#/musicxml-interfaces/builders";
import type { IAny } from "#/musicxml-interfaces/operations";
import type { PartBuilder } from "#/satie/src/engine_createPatch";
import type {
  Document,
  DocumentBuilder,
  IMeasure,
  IMeasurePart,
  IModel,
  IMouseEvent,
  ISegment,
  ISong,
  MeasureBuilder,
  StaffBuilder,
  VoiceBuilder,
} from "#/satie/src/satie";
import { Patch, Addons as SatieAddons, Song, Type } from "#/satie/src/satie";

import { cn } from "../lib/utils";
import NoteAdditionalHelp from "./MakelilyNoteAdditionalHelp";
import NotePalette from "./MakelilyNotePalette";
import makelilyStyles from "./makelilyStyles";
import type { MakelilyToolProps } from "./MakelilyToolProps";

export function toSerializable<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function getOctaveDifference(ours: string, theirs: string): number {
  function mod(a: number, b: number): number {
    return a - b * Math.floor(a / b);
  }

  const pitchNames = "CDEFGAB";
  const ourIndex: number = pitchNames.indexOf(ours.toUpperCase());
  const theirIndex: number = pitchNames.indexOf(theirs.toUpperCase());
  const up: boolean = mod(ourIndex - theirIndex, 7) > 3;
  const octaveChange: boolean = up
    ? theirIndex < ourIndex
    : theirIndex > ourIndex;
  if (octaveChange) {
    return up ? 1 : -1;
  }

  return 0;
}

const songTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN"
                                "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise>
  <identification>
    <miscellaneous>
      <miscellaneous-field name="description">
        A song created at https://www.hacklily.org
      </miscellaneous-field>
    </miscellaneous>
  </identification>
  <defaults>
    <system-layout>
      <system-margins>
        <left-margin>0</left-margin>
        <right-margin>0</right-margin>
      </system-margins>
      <system-distance>131</system-distance>
      <top-system-distance>0</top-system-distance>
    </system-layout>
  </defaults>
  <part-list>
    <score-part id="P1">
      <part-name>MusicXML Part</part-name>
    </score-part>
  </part-list>
  <!--=========================================================-->
  <part id="P1">
    <measure number="1">
      <print page-number="1">
      <system-layout>
        <system-margins>
          <left-margin>0</left-margin>
          <right-margin>0</right-margin>
        </system-margins>
        <system-distance>131</system-distance>
        <top-system-distance>40</top-system-distance>
      </system-layout>
      </print>
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>-3</fifths>
          <mode>minor</mode>
        </key>
        <time symbol="common">
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <rest measure="yes" />
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

export interface State {
  accidental: MxmlAccidental;
  canonicalOperations: any;
  direction: Direction;
  dots: number;
  editType: "N" | "R" | "P";
  lastPath: (number | string)[];
  lastPitch: Pitch;
  notation: Notations;
  note: Count;
  operations: any;
  redoStack: IAny[][];
  relativeMode: boolean;
  showAdditionalHelp:
    | "keyboard"
    | "midi"
    | "mouse"
    | "relative"
    | "whyNotEdit"
    | null;
  showHelp: boolean;
  src: string;
  timeModification: TimeModification;
  undoStack: IAny[][];
}

/**
 * A tool which allows notes to be entered with a mouse or keyboard.
 * This may also eventually support MIDI keyboards.
 */
export default function ToolNoteEdit(props: MakelilyToolProps) {
  const [state, updateState] = useReducer(
    mergeState<State>,
    undefined,
    (): State => ({
      accidental: null,
      canonicalOperations: null,
      direction: null,
      dots: 0,
      editType: "N",
      lastPath: null,
      lastPitch: null,
      notation: null,
      note: Count.Eighth,
      operations: null,
      redoStack: [],
      relativeMode: true,
      showAdditionalHelp: null,
      showHelp: true,
      src: songTemplate,
      timeModification: null,
      undoStack: [null],
    }),
  );
  const [songHandle, setSongRef] = useState<ISong | null>(null);
  const initializedDocuments = useRef(new WeakSet<Document>());
  const initializeScore = useEffectEvent((song: ISong) => {
    const doc = song.getDocument(state.canonicalOperations);
    if (initializedDocuments.current.has(doc)) return;
    initializedDocuments.current.add(doc);
    const patch = Patch.createPatch(
      false,
      doc,
      doc.measures[0].uuid,
      "P1",
      (part) =>
        part
          .staff(1, (staff) =>
            staff
              .at(1)
              .attributes((attributes) =>
                attributes
                  .clefs([props.clef])
                  .keySignatures([props.keySig])
                  .times([props.time]),
              ),
          )
          .voice(1, (voice) => voice.at(0).addVisualCursor()),
    );
    const operations = song.createCanonicalPatch(state.canonicalOperations, {
      raw: patch,
    });
    updateState((previous) => ({
      canonicalOperations: operations,
      operations,
      lastPath: null,
      lastPitch: null,
      redoStack: [],
      undoStack: previous.undoStack.concat([previous.canonicalOperations]),
    }));
  });
  useEffect(() => {
    if (songHandle) initializeScore(songHandle);
  }, [songHandle]);
  const domNode = useRef<HTMLDivElement>(null);
  useEffect(() => {
    domNode.current?.focus();
  }, []);

  function applyPreviewPatch(
    patch: IAny[],
    path: (string | number)[] = null,
    pitch: Pitch = null,
  ): void {
    const operations: any = state.canonicalOperations;
    updateState({
      lastPath: path,
      lastPitch: pitch,
      operations: songHandle.createPreviewPatch(operations, { raw: patch }),
    });
  }

  function applyUndoablePatch(
    patch: IAny[],
    _doNotEmit: boolean = false,
  ): void {
    const operations: any = state.canonicalOperations;
    const newOperations: any = songHandle.createCanonicalPatch(operations, {
      raw: patch,
    });
    const undoStack: IAny[][] = state.undoStack.concat([
      state.canonicalOperations,
    ]);
    updateState({
      canonicalOperations: newOperations,
      lastPath: null,
      lastPitch: null,
      operations: newOperations,
      redoStack: [],
      undoStack,
    });
  }

  function clearPreview(): void {
    updateState({ operations: state.canonicalOperations });
  }

  function generateLy(): string {
    if (!songHandle) {
      // still loading...
      return "";
    }

    const { relativeMode } = state;
    let prevPitch: Pitch | null = null;
    let prevDuration: Count | null = null;

    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    let ly = "";
    doc.measures.forEach((measure: IMeasure) => {
      const part: IMeasurePart = measure.parts.P1;
      const voice: ISegment = part.voices[1];
      const staff: ISegment = part.staves[1];
      let voiceDiv = 0;
      let staffDiv = 0;
      let staffModelIdx = 0;
      voice.forEach((model: IModel): void => {
        if (doc.modelHasType(model, Type.Chord)) {
          if (model.length < 1) {
            console.warn("Expected chords to have at least one note");

            return;
          }
          const noteForRythm: Note = model[0];

          if (noteForRythm.rest) {
            ly += "r";
          } else {
            let pitches = "";
            if (model.length > 1) {
              pitches += "<";
            }
            for (let i = 0; i < model.length; i += 1) {
              const note: Note = model[i];
              pitches += note.pitch.step.toLowerCase();
              if (note.pitch.alter === -1) {
                pitches += "es";
              } else if (note.pitch.alter === 1) {
                pitches += "is";
              }
              const octaveOffset: number = relativeMode
                ? prevPitch
                  ? getOctaveDifference(note.pitch.step, prevPitch.step) +
                    note.pitch.octave -
                    prevPitch.octave
                  : 0
                : note.pitch.octave - 3;
              if (octaveOffset > 0) {
                for (let j = 0; j < octaveOffset; j += 1) {
                  pitches += "'";
                }
              } else if (octaveOffset < 0) {
                for (let j = 0; j < -octaveOffset; j += 1) {
                  pitches += ",";
                }
              }
              if (i + 1 < model.length) {
                pitches += " ";
              }
              prevPitch = note.pitch;
            }
            if (model.length > 1) {
              prevPitch = model[0].pitch; // the first note in a chord affects future chords
              pitches += ">";
            }

            ly += pitches;
          }

          const duration: Count = noteForRythm.noteType.duration;
          switch (duration) {
            case prevDuration:
              break;
            case Count.Whole:
              ly += "1";
              break;
            case Count.Half:
              ly += "2";
              break;
            case Count.Quarter:
              ly += "4";
              break;
            case Count.Eighth:
              ly += "8";
              break;
            case Count._16th:
              ly += "16";
              break;
            case Count._32nd:
              ly += "32";
              break;
            case Count._64th:
              ly += "64";
              break;
            case Count._128th:
              ly += "128";
              break;
            case Count._256th:
              ly += "256";
              break;
            case Count._512th:
              ly += "512";
              break;
            case Count._1024th:
              ly += "1024";
              break;
            default:
              ly += "unknown";
          }

          prevDuration = duration;

          for (const _ of noteForRythm.dots) {
            ly += ".";
          }

          // eslint-disable-next-line @typescript-eslint/prefer-for-of
          for (let i = 0; i < model.length; i += 1) {
            if (model[i].notations) {
              model[i].notations.forEach((notations: Notations): void => {
                if (notations.fermatas) {
                  notations.fermatas.forEach((fermata: Fermata): void => {
                    if (fermata.shape === NormalAngledSquare.Angled) {
                      ly += "\\shortfermata";
                    } else if (fermata.shape === NormalAngledSquare.Square) {
                      ly += "\\longfermata";
                    } else {
                      ly += "\\fermata";
                    }
                  });
                }
                if (notations.articulations) {
                  notations.articulations.forEach(
                    (articulations: Articulations): void => {
                      if (articulations.accent) {
                        ly += "->";
                      }
                      if (articulations.tenuto && articulations.staccato) {
                        ly += "-_"; // portato
                      } else {
                        if (articulations.tenuto) {
                          ly += "--";
                        }
                        if (articulations.staccato) {
                          ly += "-.";
                        }
                      }
                      if (articulations.staccatissimo) {
                        ly += "-!";
                      }
                      if (articulations.strongAccent) {
                        ly += "-^";
                      }
                    },
                  );
                }
                if (notations.technicals) {
                  notations.technicals.forEach(
                    (technicals: Technical): void => {
                      if (technicals.harmonic) {
                        ly += "\\open";
                      }
                      if (technicals.stopped) {
                        ly += "-+";
                      }
                      if (technicals.snapPizzicato) {
                        ly += "\\snappizzicato";
                      }
                      if (technicals.upBow) {
                        ly += "\\upbow";
                      }
                      if (technicals.downBow) {
                        ly += "\\downbow";
                      }
                    },
                  );
                }
              });
            }
          }

          ly += " ";
        }

        voiceDiv += model.divCount;

        function next(): void {
          staffDiv += staff[staffModelIdx].divCount;
          staffModelIdx += 1;
        }

        for (; staffDiv < voiceDiv && staffModelIdx < staff.length; next()) {
          const staffModel: IModel = staff[staffModelIdx];
          if (doc.modelHasType(staffModel, Type.Direction)) {
            staffModel.directionTypes.forEach(
              (directionType: DirectionType): void => {
                if (directionType.dynamics) {
                  const d: Dynamics = directionType.dynamics;
                  if (d.ppp) {
                    ly += "\\ppp ";
                  }
                  if (d.pp) {
                    ly += "\\pp ";
                  }
                  if (d.p) {
                    ly += "\\p ";
                  }
                  if (d.mp) {
                    ly += "\\mp ";
                  }
                  if (d.mf) {
                    ly += "\\mf ";
                  }
                  if (d.f) {
                    ly += "\\f ";
                  }
                  if (d.ff) {
                    ly += "\\ff ";
                  }
                  if (d.fff) {
                    ly += "\\fff ";
                  }
                  if (d.fp) {
                    ly += "\\fp ";
                  }
                  if (d.sf) {
                    ly += "\\sf ";
                  }
                  if (d.sfz) {
                    ly += "\\sfz ";
                  }
                  if (d.sfp) {
                    ly += "\\sfp ";
                  }
                  if (d.rfz) {
                    ly += "\\rfz ";
                  }
                }
              },
            );
          }
        }
      });

      if (measure.idx + 1 !== doc.measures.length) {
        ly += "|\n";
      }
    });

    return ly.trim();
  }

  function getPitch(apitch: Pitch, doc: Document, measure: IMeasure): Pitch {
    const pitch: Pitch = {
      alter: apitch.alter,
      octave: apitch.octave,
      step: apitch.step,
    };
    if (state.accidental === MxmlAccidental.Sharp) {
      pitch.alter = 1;
    } else if (state.accidental === MxmlAccidental.Flat) {
      pitch.alter = -1;
    } else if (state.accidental === MxmlAccidental.Natural) {
      pitch.alter = undefined;
    } else {
      // Make the alter according to the key signature.
      const attributes: Attributes & IModel = doc.search(
        measure.parts.P1.staves[1],
        0,
        Type.Attributes,
      )[0];
      const ks: Key = attributes._snapshot.keySignatures[0];
      const accidentals: {
        [note: string]: number;
      } = SatieAddons.getAccidentalsFromKey(ks);
      pitch.alter = accidentals[pitch.step];
    }

    return pitch;
  }

  function getValidCursorTargetIndecies(
    doc: Document,
    segment: IModel[],
  ): number[] {
    const targetElements: IModel[] = doc.search(segment, 0, Type.Chord);

    return targetElements.map((el: IModel) => segment.indexOf(el));
  }

  function handleDirectionEvent(
    doc: Document,
    measure: IMeasure,
    measureUUID: number,
    ev: IMouseEvent,
    isPreview: boolean,
  ): boolean {
    const path: (string | number)[] = ev.path;
    const part: IMeasurePart = measure.parts[path[2]];
    const elIdx: number = parseInt(path[5] as string, 10);
    const staffSegment: ISegment = part.staves[1];
    const voiceSegment: ISegment = part.voices[1];
    const segment: ISegment =
      path[3] === "staves" ? staffSegment : voiceSegment;
    if (!staffSegment) {
      return true;
    }
    const el: IModel =
      (path[3] === "staves" && staffSegment[elIdx]) ||
      (path[3] === "voices" && voiceSegment[elIdx]);
    let div = 0;

    if (!el || path[3] === "staves") {
      // XXX: We should also allow placing on top of staff elements
      return false;
    }

    for (let i = 0; i < segment.length && segment[i] !== el; i += 1) {
      div += segment[i].divCount;
    }

    if (state.direction) {
      const direction: Direction = JSON.parse(JSON.stringify(state.direction));
      direction.placement = AboveBelow.Below;
      if (
        direction.directionTypes &&
        direction.directionTypes[0].dynamics &&
        isPreview
      ) {
        direction.directionTypes[0].dynamics.color = "#aeaeae";
      }

      const patch: IAny[] = Patch.createPatch(
        isPreview,
        doc,
        measureUUID,
        "P1",
        (partBuilder: PartBuilder) =>
          partBuilder.staff(1, (staff: StaffBuilder) =>
            staff.atDiv(div, Type.Direction).insertDirection(direction),
          ),
      );

      if (patch) {
        if (isPreview) {
          applyPreviewPatch(patch, path);
        } else {
          applyUndoablePatch(patch);
        }

        return true;
      }
    } else if (state.notation) {
      const notations: Notations = JSON.parse(JSON.stringify(state.notation));
      if (el && doc.modelHasType(el, Type.Chord)) {
        const patch: IAny[] = Patch.createPatch(
          isPreview,
          doc,
          measureUUID,
          "P1",
          (partBuilder: PartBuilder) =>
            partBuilder.voice(1, (voice: VoiceBuilder) =>
              voice.at(elIdx).note(0, (note: INoteBuilder) => {
                if (el[0].notations) {
                  return note.notationsSplice(0, 0, notations);
                }
                return note.notations([notations]);
              }),
            ),
        );
        if (patch) {
          if (isPreview) {
            applyPreviewPatch(patch, path);
          } else {
            applyUndoablePatch(patch);
          }

          return true;
        }
      }
    } else {
      return true;
    }

    return false;
  }

  function handleError(err: Error): void {
    console.warn(err);
  }

  function handleInsertLyClicked(): void {
    props.onInsertLy(generateLy());
  }

  function handleKeyDown(ev: KeyboardEvent<HTMLDivElement>): boolean {
    if (ev.nativeEvent.isComposing || !songHandle) return true;
    if (ev.key === "Backspace") {
      // backspace -- prevent navigation in FF and others
      ev.preventDefault();
    } else if (ev.key === "ArrowLeft") {
      // left
      moveCursor(-1);
    } else if (ev.key === "ArrowUp") {
      // up
      updateOctave(1);
      ev.preventDefault();
    } else if (ev.key === "ArrowRight") {
      // right
      moveCursor(2);
    } else if (ev.key === "ArrowDown") {
      // down
      updateOctave(-1);
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === "z" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      if (ev.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if (ev.key.length === 1 && !ev.altKey) {
      return handleTextInput(ev);
    }

    return true;
  }

  function handleTextInput(ev: KeyboardEvent<HTMLDivElement>): boolean {
    const key = ev.key.toUpperCase();
    if (
      (key === "R" || key === "C" || key === "V") &&
      (ev.metaKey || ev.ctrlKey)
    ) {
      // Support certain default browser operations by not preventing default.
      return true;
    }

    ev.preventDefault();

    if (ev.metaKey || ev.ctrlKey) {
      return false;
    }

    if (handleSetAccidentalKey(key)) {
      return false;
    }
    if (handleSetDurationKey(key)) {
      return false;
    }
    if (handleSetEditTypeKey(key)) {
      return false;
    }
    if (key === ".") {
      setDots(((state.dots || 0) + 1) % 4);

      return false;
    }

    if ("ABCDEFG".indexOf(key) !== -1) {
      const doc: Document = songHandle.getDocument(state.canonicalOperations);
      if (!doc._visualCursor) {
        return false;
      }
      if (ev.shiftKey) {
        updateChord(key);

        return false;
      }

      const path: string[] = doc._visualCursor.key
        .replace("SATIE", "")
        .split("_");
      const measureNum: number = parseInt(path[0], 10);
      const currMeasure: IMeasure = doc.measures.find(
        (i: IMeasure) => i.uuid === parseInt(path[0], 10),
      );

      // Get the previous pitch
      // HACK -- this does not support multiple voices, parts, non-linear measures
      let previousPitch: Pitch;
      for (let i = 0; i <= currMeasure.idx; i += 1) {
        const measure: IMeasure = doc.measures[i];
        const voice: ISegment = measure.parts.P1.voices[1];

        for (let j = 0; j < voice.length; j += 1) {
          if (i === currMeasure.idx && j === parseInt(path[5], 10)) {
            break;
          }

          const el: IModel = voice[j];
          if (doc.modelHasType(el, Type.Chord)) {
            const note: Note = el[0];
            if (!note.rest) {
              previousPitch = note.pitch;
            }
          }
        }
      }

      const pitch: Pitch = getPitch(
        {
          octave: previousPitch
            ? previousPitch.octave +
              getOctaveDifference(previousPitch.step, key)
            : 4,
          step: key,
        },
        doc,
        currMeasure,
      );

      if (path[3] === "voices") {
        const patch: IAny[] = Patch.createPatch(
          false,
          doc,
          measureNum,
          path[2],
          (partBuilder: PartBuilder) =>
            partBuilder.voice(parseInt(path[4], 10), (voice: VoiceBuilder) =>
              voice
                .at(parseInt(path[5], 10))
                .insertChord([
                  (note: INoteBuilder): INoteBuilder =>
                    state.accidental
                      ? note
                          .pitch(pitch)
                          .rest(undefined)
                          .dots(times(state.dots, () => ({})))
                          .noteType((noteType: ITypeBuilder) =>
                            noteType.duration(state.note),
                          )
                          .color("#000000")
                      : note
                          .pitch(pitch)
                          .rest(undefined)
                          .dots(times(state.dots, () => ({})))
                          .noteType((noteType: ITypeBuilder) =>
                            noteType.duration(state.note),
                          )
                          .color("#000000"),
                ])
                .next()
                .addVisualCursor(),
            ),
        );
        applyUndoablePatch(patch);
        playNote(pitch);
      }
    }

    return true;
  }

  function handleSetAccidentalKey(key: string): boolean {
    if (key === "=") {
      setAccidental(MxmlAccidental.Sharp);

      return true;
    }
    if (key === "-") {
      setAccidental(MxmlAccidental.Flat);

      return true;
    }
    if (key === "0") {
      setAccidental(MxmlAccidental.Natural);

      return true;
    }

    return false;
  }

  function handleSetDurationKey(key: string): boolean {
    if (key === "1") {
      setNote(32);

      return true;
    }
    if (key === "2") {
      setNote(16);

      return true;
    }
    if (key === "3") {
      setNote(8);

      return true;
    }
    if (key === "4") {
      setNote(4);

      return true;
    }
    if (key === "5") {
      setNote(2);

      return true;
    }
    if (key === "6") {
      setNote(1);

      return true;
    }

    return false;
  }

  function handleSetEditTypeKey(key: string): boolean {
    if (key === "N") {
      setEditType("N");

      return true;
    }
    if (key === "R") {
      setEditType("R");

      return true;
    }
    if (key === "P") {
      setEditType("P");

      return true;
    }

    return false;
  }

  function handleMouseClick(ev: IMouseEvent): void {
    handler(ev, false);
  }

  function handleMouseMove(ev: IMouseEvent): void {
    if (
      isEqual(state.lastPath, ev.path) &&
      isEqual(ev.pitch, state.lastPitch)
    ) {
      return;
    }
    if (!handler(ev, true)) {
      clearPreview();
    }
  }

  function handler(ev: IMouseEvent, isPreview: boolean): boolean {
    const { path } = ev;
    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    const measure: IMeasure = find(
      doc.measures,
      (fmeasure: IMeasure) => String(fmeasure.uuid) === path[0],
    );

    const measureUUID: number = parseInt(path[0] as string, 10);
    if (!measure || path[1] !== "parts" || !measure.parts[path[2]]) {
      return false;
    }
    if (state.editType === "P") {
      return handleDirectionEvent(doc, measure, measureUUID, ev, isPreview);
    }

    if (path[3] === "voices") {
      return handleVoiceEvent(doc, measure, measureUUID, ev, isPreview);
    } // this would be where we handled staff events...

    return false;
  }

  function handleShowHelpKeyboard(): void {
    updateState({
      showAdditionalHelp: "keyboard",
    });
  }

  function handleShowHelpMIDI(): void {
    updateState({
      showAdditionalHelp: "midi",
    });
  }

  function handleShowHelpMouse(): void {
    updateState({
      showAdditionalHelp: "mouse",
    });
  }

  function handleShowHelpNone(): void {
    updateState({
      showAdditionalHelp: null,
    });
  }

  function handleShowHelpRelative(): void {
    updateState({
      showAdditionalHelp: "relative",
    });
  }

  function handleShowHelpWhyNotEdit(): void {
    updateState({
      showAdditionalHelp: "whyNotEdit",
    });
  }

  function handleSongScroll(ev: UIEvent<HTMLDivElement>): void {
    const showHelp: boolean = ev.currentTarget.scrollTop === 0;

    if (showHelp !== state.showHelp) {
      updateState({
        showHelp,
      });
    }
  }

  function handleVoiceEvent(
    doc: Document,
    measure: IMeasure,
    measureUUID: number,
    ev: IMouseEvent,
    isPreview: boolean,
  ): boolean {
    const { path } = ev;
    const part: IMeasurePart = measure.parts[path[2]];
    const elIdx: number = parseInt(path[5] as string, 10);
    if (!ev.pitch) {
      return false;
    }
    const pitch: Pitch = getPitch(ev.pitch, doc, measure);

    const voiceSegment: ISegment = part.voices[parseInt(path[4] as string, 10)];
    if (!voiceSegment) {
      return true;
    }
    const el: IModel = voiceSegment[elIdx];
    if (!el) {
      return true;
    }
    const isChord: boolean = doc.modelHasType(el, Type.Chord);
    if (!isChord) {
      return false;
    }
    const chord: Note[] = el as any as Note[];
    let patch: IAny[];
    const isCurrentNote: boolean =
      chord &&
      some(
        chord,
        (c: Note) =>
          c.pitch &&
          c.pitch.octave === pitch.octave &&
          c.pitch.step === pitch.step,
      );

    if (
      (state.editType === "N" && chord.length === 1 && chord[0].rest) ||
      state.editType === "R"
    ) {
      patch = Patch.createPatch(
        isPreview,
        doc,
        measureUUID,
        "P1",
        (partBuilderOrig: PartBuilder) => {
          let partBuilder: PartBuilder = partBuilderOrig.voice(
            1,
            (voice: VoiceBuilder) =>
              voice.note(0, (note: INoteBuilder) =>
                state.editType === "R"
                  ? note
                      .pitch(null)
                      .rest({ _force: true } as {})
                      .dots(
                        times(state.dots, () => ({
                          color: isPreview ? "#cecece" : "#000000",
                        })),
                      )
                      .noteType((noteType: ITypeBuilder) =>
                        noteType.duration(state.note),
                      )
                      .color(isPreview ? "#cecece" : "#000000")
                  : state.accidental
                    ? note
                        .pitch(pitch)
                        .rest(undefined)
                        .dots(
                          times(state.dots, () => ({
                            color: isPreview ? "#cecece" : "#000000",
                          })),
                        )
                        .noteType((noteType: ITypeBuilder) =>
                          noteType.duration(state.note),
                        )
                        .color(isPreview ? "#cecece" : "#000000")
                    : note
                        .pitch(pitch)
                        .rest(undefined)
                        .dots(
                          times(state.dots, () => ({
                            color: isPreview ? "#cecece" : "#000000",
                          })),
                        )
                        .noteType((noteType: ITypeBuilder) =>
                          noteType.duration(state.note),
                        )
                        .color(isPreview ? "#cecece" : "#000000"),
              ),

            elIdx,
          );
          if (!isPreview) {
            partBuilder = partBuilder.voice(1, (voice: VoiceBuilder) =>
              voice.at(elIdx + 1).addVisualCursor(),
            );
          }

          return partBuilder;
        },
      );

      if (!isPreview) {
        // Play the note
        if (state.editType === "N") {
          playNote(pitch);
        }
      }
    } else if (
      state.editType === "N" &&
      chord.length &&
      !chord[0].rest &&
      chord[0].noteType.duration !== state.note &&
      isCurrentNote
    ) {
      patch = Patch.createPatch(
        isPreview,
        doc,
        measureUUID,
        "P1",
        (partBuilder: PartBuilder) =>
          partBuilder.voice(
            1,
            (voiceInitial: VoiceBuilder) =>
              reduce(
                times(chord.length),
                (voice: VoiceBuilder, noteIdx: number) =>
                  voice.note(noteIdx, (note: INoteBuilder) =>
                    note
                      .dots(
                        chord[0].dots.map((dot: Dot) => {
                          const newDot: Dot = toSerializable(dot);
                          newDot.color = isPreview ? "#cecece" : "#000000";

                          return newDot;
                        }),
                      )
                      .noteType((noteType: ITypeBuilder) =>
                        noteType.duration(state.note),
                      )
                      .color(isPreview ? "#cecece" : "#000000"),
                  ),
                voiceInitial,
              ),
            elIdx,
          ),
      );
    } else if (
      state.editType === "N" &&
      chord.length &&
      !chord[0].rest &&
      !isCurrentNote
    ) {
      patch = Patch.createPatch(
        isPreview,
        doc,
        measureUUID,
        "P1",
        (partBuilder: PartBuilder) =>
          partBuilder.voice(
            1,
            (voice: VoiceBuilder) =>
              voice.insertNote(chord.length, (note: INoteBuilder) =>
                note
                  .pitch(pitch)
                  .rest(undefined)
                  .dots(
                    chord[0].dots.map((dot: Dot) => {
                      const newDot: Dot = toSerializable(dot);
                      newDot.color = isPreview ? "#cecece" : "#000000";

                      return newDot;
                    }),
                  )
                  .noteType((noteType: ITypeBuilder) =>
                    noteType.duration(chord[0].noteType.duration),
                  )
                  .color(isPreview ? "#cecece" : "#000000"),
              ),
            elIdx,
          ),
      );

      if (!isPreview) {
        playNote(pitch);
        forEach(chord, (note: Note) => playNote(note.pitch));
      }
    }
    if (patch) {
      if (isPreview) {
        applyPreviewPatch(patch, path, pitch);
      } else {
        applyUndoablePatch(patch);
      }

      return true;
    }

    return false;
  }

  function moveCursor(direction: number): boolean {
    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    if (!doc._visualCursor) {
      return true;
    }
    const path: string[] = doc._visualCursor.key
      .replace("SATIE", "")
      .split("_");
    const measureUUID: number = parseInt(path[0], 10);
    const part: string = path[2];
    if (path[3] !== "voices") {
      return true;
    }
    const voiceNum: number = parseInt(path[4], 10);
    const elIdx: number = parseInt(path[5], 10);
    const currMeasure: IMeasure = doc.measures.find(
      (i: IMeasure) => i.uuid === measureUUID,
    );

    const currSegment: ISegment = currMeasure.parts[part].voices[voiceNum];

    const targetIndecies: number[] = getValidCursorTargetIndecies(
      doc,
      currSegment,
    );

    const nextIdx: number = targetIndecies.reduce(
      (memo: number, idx: number) => {
        if (direction < 0 && idx < elIdx) {
          return idx;
        } else if (direction > 0 && idx > elIdx && memo === null) {
          return idx + 1;
        }

        return memo;
      },
      null,
    );
    if (nextIdx === null) {
      if (direction > 0) {
        moveCursorToStartOfMeasure(
          part,
          voiceNum,
          doc.measures[currMeasure.idx + 1],
        );
      } else if (direction < 0) {
        moveCursorToEndOfMeasure(
          part,
          voiceNum,
          doc.measures[currMeasure.idx - 1],
        );
      } else {
        invariant(false, "Invalid direction");
      }
    } else {
      const patch: IAny[] = Patch.createPatch(
        false,
        doc,
        measureUUID,
        part,
        (partBuilder: PartBuilder) =>
          partBuilder.voice(voiceNum, (voice: VoiceBuilder) =>
            voice.at(nextIdx).addVisualCursor(),
          ),
      );
      applyUndoablePatch(patch);
    }

    return false;
  }

  function moveCursorToEndOfMeasure(
    part: string,
    voiceNum: number,
    measure: IMeasure,
  ): void {
    moveInMeasure(
      part,
      voiceNum,
      measure,
      (indecies: number[]) => last(indecies) + 1,
    );
  }

  function moveCursorToStartOfMeasure(
    part: string,
    voiceNum: number,
    measure: IMeasure,
  ): void {
    moveInMeasure(part, voiceNum, measure, first);
  }

  function moveInMeasure(
    part: string,
    voiceNum: number,
    measure: IMeasure,
    pickIdx: (n: number[]) => number,
  ): void {
    if (!measure) {
      return;
    }
    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    const targetIndecies: number[] = getValidCursorTargetIndecies(
      doc,
      measure.parts[part].voices[voiceNum],
    );
    const nextIdx: number = pickIdx(targetIndecies);
    const patch: IAny[] = Patch.createPatch(
      false,
      doc,
      measure.uuid,
      part,
      (partBuilder: PartBuilder) =>
        partBuilder.voice(voiceNum, (voice: VoiceBuilder) =>
          voice.at(nextIdx).addVisualCursor(),
        ),
    );
    applyUndoablePatch(patch);
  }

  function newMeasure(): void {
    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    const measureCount: number = doc.measures.length;
    const measureUUID: number = doc.measures[doc.measures.length - 1].uuid;
    const measureIdx: number = doc.measures.findIndex(
      (m: IMeasure) => m.uuid === measureUUID,
    );

    const undoStack: IAny[][] = state.undoStack.concat([
      state.canonicalOperations,
    ]);

    const barlineIdx: number = findIndex(
      doc.measures[measureIdx].parts.P1.staves[1],
      (el: IModel) => doc.modelHasType(el, Type.Barline),
    );

    const operations: any = songHandle.createCanonicalPatch(
      state.canonicalOperations,
      {
        documentBuilder: (document: DocumentBuilder): DocumentBuilder =>
          document
            .measure(measureUUID, (measure: MeasureBuilder) =>
              measure.part("P1", (part: PartBuilder) =>
                part.staff(1, (staff: StaffBuilder) =>
                  staff
                    .at(barlineIdx)
                    .barline((barline: IBarlineBuilder) =>
                      barline.barStyle((style: IBarStyleBuilder) =>
                        style.data(BarStyleType.Regular),
                      ),
                    ),
                ),
              ),
            )
            .insertMeasure(measureIdx + 1, (measure: MeasureBuilder) =>
              measure.part("P1", (part: PartBuilder) =>
                part
                  .voice(1, (voice: VoiceBuilder) =>
                    voice.at(0).insertChord([
                      (note: INoteBuilder): INoteBuilder =>
                        note
                          .rest({})
                          .staff(1)
                          .noteType((noteType: ITypeBuilder) =>
                            noteType.duration(Count.Whole),
                          ),
                    ]),
                  )
                  .staff(1, (staff: StaffBuilder) =>
                    staff
                      .at(1)
                      .insertBarline((barline: IBarlineBuilder) =>
                        barline.barStyle((style: IBarStyleBuilder) =>
                          style.data(
                            measureCount === measureIdx + 1
                              ? BarStyleType.LightHeavy
                              : BarStyleType.Regular,
                          ),
                        ),
                      ),
                  ),
              ),
            ),
      },
    );
    updateState({
      canonicalOperations: operations,
      operations,
      redoStack: [],
      undoStack,
    });
  }

  function playNote(pitch: Pitch): void {
    console.log("TODO: play", pitch);
  }

  function redo(): void {
    updateState({
      canonicalOperations: state.redoStack[state.redoStack.length - 1],
      operations: state.redoStack[state.redoStack.length - 1],
      redoStack: state.redoStack.slice(0, state.redoStack.length - 1),
      undoStack: state.undoStack.concat(state.operations),
    });
  }

  function renderAdditionalHelp() {
    if (state.showAdditionalHelp === null) {
      return null;
    }

    return (
      <NoteAdditionalHelp
        kind={state.showAdditionalHelp}
        onHide={handleShowHelpNone}
      />
    );
  }

  function renderPalette() {
    return (
      <NotePalette
        accidental={state.accidental}
        direction={state.direction}
        dots={state.dots}
        editType={state.editType}
        notation={state.notation}
        note={state.note}
        redo={redo}
        setAccidental={setAccidental}
        setDirection={setDirection}
        setTimeModification={setTimeModification}
        setDots={setDots}
        setEditType={setEditType}
        setNotation={setNotation}
        setNote={setNote}
        timeModification={state.timeModification}
        newMeasure={newMeasure}
        undo={undo}
      />
    );
  }

  function setAccidental(accidental): void {
    if (state.accidental === accidental && state.editType === "N") {
      updateState({
        accidental: null,
        editType: "N",
      });
    } else {
      updateState({
        accidental,
        editType: "N",
      });
    }
  }

  function setDirection(direction) {
    updateState({
      direction,
      notation: null,
    });
  }

  function setDots(dots: number): void {
    updateState({
      dots,
      editType: state.editType === "R" ? "R" : "N",
    });
  }

  function setEditType(editType): void {
    updateState({
      editType,
    });
  }

  function setNotation(notation) {
    updateState({
      direction: null,
      notation,
    });
  }

  function setNote(note): void {
    updateState({
      editType: state.editType === "R" ? "R" : "N",
      note,
    });
  }

  function setTimeModification(timeModification: TimeModification): void {
    updateState({
      editType: state.editType === "R" ? "R" : "N",
      timeModification,
    });
  }

  function undo(): void {
    updateState({
      canonicalOperations: state.undoStack[state.undoStack.length - 1],
      operations: state.undoStack[state.undoStack.length - 1],
      redoStack: state.redoStack.concat(state.operations),
      undoStack: state.undoStack.slice(0, state.undoStack.length - 1),
    });
  }

  function updateChord(newNote: string): boolean {
    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    if (!doc._visualCursor) {
      return false;
    }

    const path: string[] = doc._visualCursor.key
      .replace("SATIE", "")
      .split("_");
    const currMeasure: IMeasure = doc.measures.find(
      (i: IMeasure) => i.uuid === parseInt(path[0], 10),
    );

    if (path[3] !== "voices") {
      return false;
    }

    // HACK -- this does not support multiple voices, parts, non-linear measures
    let oldPitch: Pitch;
    let oldDots: number;
    let oldMeasureUUID: number;
    let oldIdx: number;
    let oldNumberOfNotes: number;
    let oldDuration: Count;

    for (let i = 0; i <= currMeasure.idx; i += 1) {
      const measure: IMeasure = doc.measures[i];
      const voice: ISegment = measure.parts.P1.voices[1];

      for (let j = 0; j < voice.length; j += 1) {
        if (i === currMeasure.idx && j === parseInt(path[5], 10)) {
          break;
        }

        const el: IModel = voice[j];
        if (doc.modelHasType(el, Type.Chord)) {
          const note: Note = el[el.length - 1];
          if (!note.rest) {
            oldPitch = note.pitch;
            oldDuration = note.noteType.duration;
            oldDots = note.dots.length;
            oldMeasureUUID = measure.uuid;
            oldIdx = j;
            oldNumberOfNotes = el.length;
          }
        }
      }
    }

    if (oldPitch) {
      const newPitch: Pitch = getPitch(
        {
          octave: oldPitch
            ? oldPitch.octave + getOctaveDifference(oldPitch.step, newNote)
            : 4,
          step: newNote,
        },
        doc,
        currMeasure,
      );

      const patch: IAny[] = Patch.createPatch(
        false,
        doc,
        oldMeasureUUID,
        path[2],
        (partBuilder: PartBuilder) =>
          partBuilder.voice(1, (oldVoice: VoiceBuilder) =>
            oldVoice
              .at(oldIdx)
              .insertNote(oldNumberOfNotes, (noteBuilder: INoteBuilder) =>
                noteBuilder
                  .pitch(newPitch)
                  .rest(undefined)
                  .dots(times(oldDots, () => ({})))
                  .noteType((noteType: ITypeBuilder) =>
                    noteType.duration(oldDuration),
                  ),
              ),
          ),
      );
      applyUndoablePatch(patch);
      playNote(newPitch);

      return true;
    }

    return false;
  }

  function updateOctave(octave: number): boolean {
    const doc: Document = songHandle.getDocument(state.canonicalOperations);
    if (!doc._visualCursor) {
      return false;
    }

    const path: string[] = doc._visualCursor.key
      .replace("SATIE", "")
      .split("_");
    const currMeasure: IMeasure = doc.measures.find(
      (i: IMeasure) => i.uuid === parseInt(path[0], 10),
    );

    if (path[3] !== "voices") {
      return false;
    }

    // HACK -- this does not support multiple voices, parts, non-linear measures
    let oldPitch: Pitch;
    let oldMeasureUUID: number;
    let oldIdx: number;
    let oldNoteNumber: number;

    for (let i = 0; i <= currMeasure.idx; i += 1) {
      const measure: IMeasure = doc.measures[i];
      const voice: ISegment = measure.parts.P1.voices[1];

      for (let j = 0; j < voice.length; j += 1) {
        if (i === currMeasure.idx && j === parseInt(path[5], 10)) {
          break;
        }

        const el: IModel = voice[j];
        if (doc.modelHasType(el, Type.Chord)) {
          oldNoteNumber = el.length - 1;
          const note: Note = el[oldNoteNumber];
          if (!note.rest) {
            oldPitch = note.pitch;
            oldMeasureUUID = measure.uuid;
            oldIdx = j;
          }
        }
      }
    }

    if (oldPitch) {
      const updatedPitch: Pitch = {
        ...oldPitch,
        octave: oldPitch.octave + octave,
      };

      const patch: IAny[] = Patch.createPatch(
        false,
        doc,
        oldMeasureUUID,
        path[2],
        (partBuilder: PartBuilder) =>
          partBuilder.voice(1, (oldVoice: VoiceBuilder) =>
            oldVoice
              .at(oldIdx)
              .note(oldNoteNumber, (oldNote: INoteBuilder) =>
                oldNote.pitch(updatedPitch),
              ),
          ),
      );
      applyUndoablePatch(patch);
      playNote(updatedPitch);

      return true;
    }

    return false;
  }

  const { editType } = state;
  const tallPalette: boolean = editType === "P";

  const song = state.src ? (
    <Song
      baseSrc={state.src}
      onError={handleError}
      patches={state.operations}
      onMouseClick={handleMouseClick}
      onMouseMove={handleMouseMove}
      pageClassName={cn(styles.song)}
      ref={setSongRef}
    />
  ) : null;

  return (
    <div
      ref={domNode}
      className={cn(makelilyStyles.tool)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="textbox"
    >
      <div
        className={cn(
          makelilyStyles.help,
          state.showHelp && makelilyStyles.helpVisible,
          "inline-flex",
        )}
      >
        <Info size="1em" className="self-center mr-1 inline" />
        <span>
          {" "}
          Generate markup
          <sup>
            <a href="#" onClick={handleShowHelpWhyNotEdit} role="button">
              ?
            </a>
          </sup>{" "}
          for notes in your song using a{" "}
          <a href="#" onClick={handleShowHelpMouse} role="button">
            mouse
          </a>
          ,{" "}
          <a href="#;" onClick={handleShowHelpKeyboard} role="button">
            computer keyboard
          </a>
          , or{" "}
          <a href="#;" onClick={handleShowHelpMIDI} role="button">
            MIDI keyboard
          </a>
        </span>
        .
      </div>

      {renderAdditionalHelp()}
      {renderPalette()}
      <div className={cn(makelilyStyles.section, "bg-white")}>
        <div
          className={cn(
            styles.songContainer,
            tallPalette && styles.songContainerSmall,
          )}
          onScroll={handleSongScroll}
        >
          {song}
        </div>
      </div>
      <div className={cn(makelilyStyles.spacer)} />
      <div className={cn(makelilyStyles.section)}>
        <span className={cn(makelilyStyles.outputOptions)}>
          <input
            type="checkbox"
            checked={state.relativeMode}
            onChange={(): void =>
              updateState({ relativeMode: !state.relativeMode })
            }
            aria-checked={false}
            id="toolnoteedit-relative"
          />
          <label htmlFor="toolnoteedit-relative">
            <code>\relative</code> mode
            <sup>
              <a href="#" onClick={handleShowHelpRelative} role="button">
                ?
              </a>
            </sup>{" "}
          </label>
        </span>
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

const styles = {
  newBar: "text-center",
  song: "w-full",
  songContainer:
    "-ml-[18px] -mr-[18px] -mt-[48px] max-h-[388px] overflow-x-hidden overflow-y-scroll",
  songContainerSmall: "max-h-[308px]",
} as const;
