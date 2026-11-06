// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { map } from "lodash";
import { useContext } from "react";

import type { Note } from "#/musicxml-interfaces";
import { NoteheadType } from "#/musicxml-interfaces";

import AccidentalView from "./implAttributes_accidentalView";
import NoteheadView from "./implChord_noteheadView";
import { RenderContext } from "./private_renderContext";
import { getLeft, getRight } from "./private_smufl";
import Dot from "./private_views_dot";
import Glyph from "./private_views_glyph";

export interface IProps {
  spec: Note;
  noteheadGlyph: string;
  key?: string;
  defaultX?: number;
}

export default function NoteView(props: IProps) {
  const renderContext = useContext(RenderContext);
  function getRenderContext() {
    return {
      ...renderContext,
      originY: renderContext.originY - props.spec.defaultY,
    };
  }

  const spec = props.spec;

  if (spec.printObject === false) {
    return null;
  }
  const defaultX = props.defaultX || spec.defaultX;

  const noteheadGlyph = props.noteheadGlyph;
  const right = getRight(noteheadGlyph);
  const left = getLeft(noteheadGlyph);

  const hasParens = spec.notehead && spec.notehead.parentheses;

  return (
    <RenderContext value={getRenderContext()}>
      <g>
        {
          <NoteheadView
            key="h"
            notehead={noteheadGlyph}
            spec={{
              color: spec.color,
              defaultX,
              defaultY: 0,
              type: spec.notehead ? spec.notehead.type : NoteheadType.Normal,
            }}
          />
        }
        {spec.dots && spec.printDot !== false
          ? map(spec.dots, (dot, idx) => (
              <Dot
                fill={dot.color}
                key={"_1_" + idx}
                radius={2.4}
                x={defaultX + right + 6 + 6 * idx}
                y={
                  renderContext.originY -
                  props.spec.defaultY -
                  (dot.defaultY + (dot.relativeY || 0))
                }
              />
            ))
          : null}
        {props.spec.accidental ? (
          <AccidentalView
            key="a"
            spec={props.spec.accidental}
            noteDefaultX={defaultX}
          />
        ) : null}
        {hasParens && (
          <Glyph
            glyphName="noteheadParenthesisRight"
            fill="black"
            y={renderContext.originY - props.spec.defaultY}
            x={defaultX + right + 2}
          />
        )}
        {hasParens && (
          <Glyph
            glyphName="noteheadParenthesisLeft"
            fill="black"
            y={renderContext.originY - props.spec.defaultY}
            x={defaultX + left - 5}
          />
        )}
      </g>
    </RenderContext>
  );
}
