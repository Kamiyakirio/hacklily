// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import type { Notehead, Position } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import Glyph from "./private_views_glyph";

export interface IProps {
  key?: string | number;
  spec: Notehead | Position;
  notehead: string;
}

/**
 * Renders a notehead.
 */
export default function NoteheadView(props: IProps) {
  const renderContext = useContext(RenderContext);

  const spec = props.spec;
  const pos = spec as Position;
  const head = spec as Notehead;

  return (
    <Glyph
      fill={head.color}
      glyphName={props.notehead}
      // scale: this.props.grace ? 0.6 : 1.0,
      x={pos.defaultX + (pos.relativeX || 0)}
      y={renderContext.originY - pos.defaultY - (pos.relativeY || 0)}
    />
  );
}
