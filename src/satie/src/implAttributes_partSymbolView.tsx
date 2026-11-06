// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import type { PartSymbol } from "#/musicxml-interfaces";
import { PartSymbolType } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import { bravura } from "./private_smufl";
import Glyph from "./private_views_glyph";
import Line from "./private_views_line";

const BRACE_H_SCALE = 2.9;

export interface IProps {
  key?: string | number;
  spec: PartSymbol;
}

/**
 * Renders a piano bracket or other kind of brace.
 */
export default function PartSymbolView(props: IProps) {
  const renderContext = useContext(RenderContext);
  function getSymbol(): any {
    const spec = props.spec;

    const height = renderContext.systemBottom - renderContext.systemTop;
    const bottom = renderContext.systemBottom;

    const defaults = bravura.engravingDefaults; // TODO: Use 'print'

    const x = props.spec.defaultX - 14;

    const s = height / 40;

    switch (spec.type) {
      case PartSymbolType.Brace:
        return (
          <Glyph
            fill="#000000"
            glyphName="brace"
            key="partSymbolMain"
            transform={
              "scale(" +
              BRACE_H_SCALE +
              "," +
              s +
              ")" +
              "translate(" +
              -x * (1 - 1 / BRACE_H_SCALE) +
              "," +
              -1 * (1 - 1 / s) * bottom +
              ")"
            }
            x={x}
            y={bottom}
          />
        );
      case PartSymbolType.Bracket:
      case PartSymbolType.Square: // TODO: Not implemented
        return [
          <Line
            key="partSymbolMain"
            stroke="#000000"
            strokeWidth={defaults.bracketThickness * 10}
            x1={x + 4 + 2.5}
            x2={x + 4 + 2.5}
            y1={bottom - height - 2 - 3}
            y2={bottom + 2 + 3}
          />,
          <Glyph
            fill="#000000"
            glyphName="bracketTop"
            key="bracketTop"
            x={x + 4}
            y={renderContext.systemTop - 2}
          />,
          <Glyph
            fill="#000000"
            glyphName="bracketBottom"
            key="bracketBottom"
            x={x + 4}
            y={renderContext.systemBottom + 2}
          />,
        ];
      case PartSymbolType.Line:
        return null;
      default:
        throw new Error(`Invalid PartSymbolType ${spec.type}`);
    }
  }

  if (props.spec.type === PartSymbolType.None) {
    return null;
  }

  const defaults = bravura.engravingDefaults; // TODO: Use 'print'

  const height = renderContext.systemBottom - renderContext.systemTop;
  const bottom = renderContext.systemBottom;

  const sym = getSymbol();
  return (
    <g>
      {sym}
      <Line
        key="line"
        stroke="#000000"
        strokeWidth={defaults.thinBarlineThickness * 10}
        x1={props.spec.defaultX}
        x2={props.spec.defaultX}
        y1={bottom - height}
        y2={bottom}
      />
    </g>
  );
}
