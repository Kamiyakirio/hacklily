// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import { toPathData } from "./private_fontManager";
import { RenderContext } from "./private_renderContext";
import { getGlyphCode } from "./private_smufl";

export interface IProps {
  key?: string | number;
  fill: string;
  glyphName: string;
  "selection-info"?: string;
  transform?: string;
  x: number;
  y: number;
  opacity?: number;
  code?: string;
  scale?: number;
}

/**
 * Most musical elements are rendered as glyphs. Exceptions include
 * slurs, ties, dots in dotted notes, ledger lines, and stave lines.
 */
export default function Glyph(props: IProps) {
  const renderContext = useContext(RenderContext);

  const px = props.x;
  const py = props.y;

  if (renderContext.renderTarget === "svg-export") {
    const pathData = toPathData(
      "Bravura",
      getGlyphCode(props.glyphName),
      px,
      py,
      40 * (props.scale || 1),
    );
    return <path d={pathData} />;
  }

  const text = (
    <text
      className="mn_"
      fill={props.fill}
      fillOpacity={props.opacity}
      fontSize={40 * (props.scale || 1)}
      strokeOpacity={props.opacity}
      transform={props.transform}
      x={px}
      y={py}
    >
      {getGlyphCode(props.glyphName)}
    </text>
  );

  return text;
}
