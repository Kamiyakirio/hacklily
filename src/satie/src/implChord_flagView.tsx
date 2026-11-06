// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import { RenderContext } from "./private_renderContext";
import { getFontOffset } from "./private_smufl";
import Glyph from "./private_views_glyph";

export interface IProps {
  key?: string | number;
  spec: {
    defaultX: number;
    defaultY: number;
    color: string;
    flag: string;
    direction: number;
  };
  isGrace?: boolean;
  notehead: string;
  stemWidth: number;
  stemHeight: number;
}

/**
 * Responsible for rendering the "flag" on un-beamed notes shorter than quarter notes.
 */
export default function Flag(props: IProps) {
  const renderContext = useContext(RenderContext);
  function directionString() {
    if (props.spec.direction === 1) {
      return "Up";
    } else if (props.spec.direction === -1) {
      return "Down";
    }

    throw new Error("Invalid direction");
  }

  function glyphName() {
    return props.spec.flag + directionString();
  }

  const spec = props.spec;
  const context = renderContext;

  const xscale = props.isGrace ? 0.6 : 1.0;
  const dir = spec.direction;
  const fontOffsetX = getFontOffset(glyphName(), dir)[0] * xscale;
  const noteOffsetX = getFontOffset(props.notehead, dir)[0] * xscale;
  const noteOffsetY = getFontOffset(props.notehead, dir)[1] * 10;
  return (
    <Glyph
      fill={spec.color}
      glyphName={glyphName()}
      scale={props.isGrace ? 0.6 : 1.0}
      x={
        spec.defaultX +
        fontOffsetX * 10 +
        (dir === 1 ? noteOffsetX * 10 - props.stemWidth : 0)
      }
      y={context.originY - spec.defaultY - noteOffsetY * 4}
    />
  );
}
