// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
import { useContext } from "react";

import type { Accidental } from "#/musicxml-interfaces";

import { accidentalGlyphs } from "./private_chordUtil";
import { RenderContext } from "./private_renderContext";
import { bboxes } from "./private_smufl";
import Glyph from "./private_views_glyph";

export interface IProps {
  spec: Accidental;
  key?: string | number;
  noteDefaultX?: number;
}

export default function AccidentalView(props: IProps) {
  const renderContext = useContext(RenderContext);

  const spec = props.spec;
  const glyphName = accidentalGlyphs[props.spec.accidental];
  invariant(glyphName in bboxes, "Expected a glyph, got %s", glyphName);

  const originY = renderContext.originY || 0;
  const shift = spec.parentheses ? 4 : 0;

  const y = originY - (spec.defaultY + (spec.relativeY || 0));
  invariant(!isNaN(y), "Invalid accidental y-position");

  const accidental = (
    <Glyph
      fill={spec.color}
      glyphName={glyphName}
      x={
        (props.noteDefaultX || 0) +
        spec.defaultX +
        (spec.relativeX || 0) +
        shift
      }
      y={y}
    />
  );

  if (spec.parentheses || spec.bracket) {
    const width = bboxes[glyphName][0] * 10; // TODO: it's actually 2 - 0!
    return (
      <g>
        <Glyph
          fill="#000000"
          glyphName="accidentalParensLeft"
          x={
            (props.noteDefaultX || 0) +
            spec.defaultX +
            (spec.relativeX || 0) -
            7 +
            shift
          }
          y={originY - (spec.defaultY + (spec.relativeY || 0))}
        />
        {accidental}
        <Glyph
          fill="#000000"
          glyphName="accidentalParensRight"
          x={
            (props.noteDefaultX || 0) +
            spec.defaultX +
            (spec.relativeX || 0) +
            width +
            shift
          }
          y={originY - (spec.defaultY + (spec.relativeY || 0))}
        />
      </g>
    );
  } else {
    return accidental;
  }
}
