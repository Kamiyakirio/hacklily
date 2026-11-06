/* eslint-disable no-shadow */
import { defer, find, isEqual } from "lodash";
import { useEffect, useReducer, useState } from "react";

import { mergeState } from "#/lib/state";
import type { Note, Pitch } from "#/musicxml-interfaces";
import { Count, MxmlAccidental } from "#/musicxml-interfaces";
import type { IAny } from "#/musicxml-interfaces/operations";

import type { IMouseEvent, ISong } from "../../src/satie";
import { Patch, Song, Type } from "../../src/satie";

import STYLES from "./tests.module.css";

interface IState {
  error?: Error;
  operations?: any;
  canonicalOperations?: any;
  oldOperations?: IAny[][];
  note?: Count;
  type?: "N" | "R";
  lastPath?: (number | string)[];
  lastPitch?: Pitch;
}

const songTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN"
                                "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise>
  <movement-title>Satie Sandbox</movement-title>
  <identification>
    <miscellaneous>
      <miscellaneous-field name="description">
        A song created at https://nettek.ca/satie
      </miscellaneous-field>
    </miscellaneous>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>MusicXML Part</part-name>
    </score-part>
  </part-list>
  <!--=========================================================-->
  <part id="P1">
    <measure number="1">
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
    <measure number="2">
      <note>
        <rest measure="yes" />
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest measure="yes" />
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

function Sandbox() {
  const [state, updateState] = useReducer(
    mergeState<IState>,
    undefined,
    (): IState => ({
      error: null,
      canonicalOperations: null,
      operations: null,
      oldOperations: [null],
      note: Count.Eighth,
      type: "N",
      lastPath: null,
      lastPitch: null,
    }),
  );
  const [songHandle, _setSongRef] = useState<ISong | null>(null);
  useEffect(() => {
    if (!songHandle) return;
    const debugWindow = window as Window & { _song?: ISong };
    debugWindow._song = songHandle;
    return () => {
      if (debugWindow._song === songHandle) delete debugWindow._song;
    };
  }, [songHandle]);

  function _setNote(note: number) {
    updateState({
      note,
    });
  }

  function _setType(type: "N" | "R") {
    updateState({
      type,
    });
  }

  function _undo() {
    updateState({
      operations: state.oldOperations[state.oldOperations.length - 1],
      canonicalOperations: state.oldOperations[state.oldOperations.length - 1],
      oldOperations: state.oldOperations.slice(
        0,
        state.oldOperations.length - 1,
      ),
    });
  }

  function _newMeasure() {
    const doc = songHandle.getDocument(state.canonicalOperations);
    const measureCount = doc.measures.length;

    const oldOperations = state.oldOperations.concat([
      state.canonicalOperations,
    ]);
    const operations = songHandle.createCanonicalPatch(
      state.canonicalOperations,
      {
        documentBuilder: (document) =>
          document.insertMeasure(measureCount, (measure) =>
            measure.part("P1", (part) =>
              part.voice(1, (voice) =>
                voice.at(0).insertChord([
                  (note) =>
                    note
                      .rest({})
                      .staff(1)
                      .noteType((type) => type.duration(Count.Whole)),
                ]),
              ),
            ),
          ),
      },
    );
    updateState({
      operations,
      oldOperations,
      canonicalOperations: operations,
    });
  }

  function _newCursor() {
    const doc = songHandle.getDocument(state.canonicalOperations);
    const patch = [
      {
        p: [doc.measures[0].uuid, "parts", "P1", "voices", "1", 1],
        li: {
          _class: "VisualCursor",
        },
      },
    ];
    const oldOperations = state.oldOperations.concat([state.operations]);
    const operations = songHandle.createCanonicalPatch(
      state.canonicalOperations,
      { raw: patch },
    );
    updateState({
      operations,
      oldOperations,
      canonicalOperations: operations,
    });
  }

  function _errorHandler(err: Error) {
    console.warn(err);
    defer(() => {
      updateState({
        error: err,
      });
    });
  }

  function _mouseMoveHandler(ev: IMouseEvent) {
    if (
      isEqual(state.lastPath, ev.path) &&
      isEqual(ev.pitch, state.lastPitch)
    ) {
      return;
    }
    if (!_handler(ev, true)) {
      updateState({ operations: state.canonicalOperations });
    }
  }

  function _mouseClickHandler(ev: IMouseEvent) {
    _handler(ev, false);
  }

  function _handler(ev: IMouseEvent, isPreview: boolean): boolean {
    const { path, pitch } = ev;
    const oldOperations = state.oldOperations.concat([
      state.canonicalOperations,
    ]);
    const operations = state.canonicalOperations;
    const doc = songHandle.getDocument(operations); // TODO: remove getDocument
    const measure = find(
      doc.measures,
      (fmeasure) => String(fmeasure.uuid) === path[0],
    );
    if (!measure || path[1] !== "parts" || !measure.parts[path[2]]) {
      return false;
    }
    const part = measure.parts[path[2]];
    if (path[3] === "staves") {
      const staff = part.staves[parseInt(path[4] as string, 10)];
      if (!staff) {
        return false;
      }
    } else if (path[3] === "voices") {
      const voice = part.voices[parseInt(path[4] as string, 10)];
      if (!voice) {
        return false;
      }
      const elIdx = parseInt(path[5] as string, 10);
      const el = voice[elIdx];
      if (!el) {
        return false;
      }
      const isChord = doc.modelHasType(el, Type.Chord);
      if (!isChord) {
        return false;
      }
      const chord = el as any as Note[];
      const measureUUID = parseInt(path[0] as string, 10);
      let patch: IAny[];
      if (
        (state.type === "N" && chord.length === 1 && chord[0].rest) ||
        (state.type === "R" && chord.length === 1 && !chord[0].rest)
      ) {
        patch = Patch.createPatch(isPreview, doc, measureUUID, "P1", (part) =>
          part.voice(1, (voice) =>
            voice.at(elIdx).note(0, (note) =>
              state.type === "R"
                ? note
                    .pitch(null)
                    .dots([])
                    .noteType((noteType) => noteType.duration(state.note))
                    .color(isPreview ? "#cecece" : "#000000")
                : note
                    .pitch(pitch)
                    .dots([])
                    .noteType((noteType) => noteType.duration(state.note))
                    .accidental((accidental) =>
                      accidental.accidental(MxmlAccidental.Sharp),
                    )
                    .color(isPreview ? "#cecece" : "#000000"),
            ),
          ),
        );
      } else if (
        state.type === "N" &&
        chord.length &&
        !chord[0].rest &&
        chord[0].noteType.duration !== state.note
      ) {
        patch = Patch.createPatch(isPreview, doc, measureUUID, "P1", (part) =>
          part.voice(
            1,
            (voice) =>
              voice.note(0, (note) =>
                note
                  .noteType((noteType) => noteType.duration(state.note))
                  .color(isPreview ? "#cecece" : "#000000"),
              ),
            elIdx,
          ),
        );
      }

      if (patch) {
        if (isPreview) {
          updateState({
            operations: songHandle.createPreviewPatch(operations, {
              raw: patch,
            }),
            lastPath: path,
            lastPitch: pitch,
          });
        } else {
          const newOperations = songHandle.createCanonicalPatch(operations, {
            raw: patch,
          });
          updateState({
            operations: newOperations,
            canonicalOperations: newOperations,
            lastPath: null,
            lastPitch: null,
            oldOperations,
          });
        }
        return true;
      }
    }
    return false;
  }

  return (
    <div>
      <h1>Satie &ndash; Sandbox</h1>
      <div className={STYLES.tests}>
        <p>Use this page to test song editing.</p>
        <ul style={{ display: "flex", listStyleType: "none" }}>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setNote.bind(this, Count._32nd)}>
              32
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setNote.bind(this, Count._16th)}>
              16
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setNote.bind(this, Count.Eighth)}>
              8
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setNote.bind(this, Count.Quarter)}>
              4
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setNote.bind(this, Count.Half)}>
              2
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setNote.bind(this, Count.Whole)}>
              1
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setType.bind(this, "N")}>
              N
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_setType.bind(this, "R")}>
              R
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_undo.bind(this)}>
              Undo
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_newMeasure.bind(this)}>
              +
            </a>
          </li>
          <li style={{ padding: 10 }}>
            <a href="#" onClick={_newCursor.bind(this)}>
              +
            </a>
          </li>
        </ul>
        <Song
          baseSrc={songTemplate}
          onError={_errorHandler}
          patches={state.operations}
          onMouseClick={_mouseClickHandler}
          onMouseMove={_mouseMoveHandler}
          pageClassName={STYLES.page}
          singleLineMode
          ref={_setSongRef}
        />
        {/*<pre style={{fontSize: 8, height: 400, overflow: "scroll"}}>{
                JSON.stringify(this.state.operations, null, 2)}</pre>*/}
      </div>
    </div>
  );
}

export default function SandboxPage() {
  return (
    <div>
      <h1>Satie &ndash; Sandbox</h1>
      <Sandbox />
    </div>
  );
}
