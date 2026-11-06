// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { first, last } from "lodash";
/**
 * @file Renders a tuplet outside of a beam. Unbeamed tuplets are created
 * by the beam postprocessor, since they share many similaraties.
 */
// Note that we use notehadBlack regardless of the notehead.
// This keeps spacing consistent, even in beam groups with rests.
import { useContext } from "react";

import { AboveBelow } from "#/musicxml-interfaces";

import type { IBeamLayout } from "./implChord_beamLayout";
import TupletNumberView from "./implChord_tupletNumberView";
import { RenderContext } from "./private_renderContext";
import { bravura, getFontOffset } from "./private_smufl";

export interface IProps {
  key?: string | number;
  stroke: string;
  stemWidth: number;
  layout: IBeamLayout;
}

export default function UnbeamedTuplet(props: IProps) {
  const renderContext = useContext(RenderContext);
  function getLineXOffset() {
    return (direction() * -props.stemWidth) / 2;
  }

  function direction() {
    return props.layout.tuplet.placement === AboveBelow.Above ? 1 : -1;
  }

  function _withXOffset(x: number) {
    return (
      x + getFontOffset("noteheadBlack", direction())[0] * 10 + getLineXOffset()
    );
  }

  function _getX1() {
    const { x } = props.layout;
    return _withXOffset(first(x)) - 4;
  }

  function _getX2() {
    const { x } = props.layout;
    return _withXOffset(last(x)) + 4;
  }

  function _getY1(incl: number) {
    const { originY } = renderContext;
    const { layout } = props;
    const { y1 } = layout;
    return (
      originY -
      y1 -
      direction() * getFontOffset("noteheadBlack", direction())[1] * 10 -
      (incl || 0) * (bravura.engravingDefaults.tupletBracketThickness * 10)
    );
  }

  function _getY2(incl: number) {
    const { originY } = renderContext;
    const { layout } = props;
    const { y2 } = layout;
    return (
      originY -
      y2 -
      direction() * getFontOffset("noteheadBlack", direction())[1] * 10 -
      (incl || 0) * (bravura.engravingDefaults.tupletBracketThickness * 10)
    );
  }

  const { stroke, layout } = props;
  const { tuplet, x } = layout;
  const { placement } = tuplet;
  const yOffset = placement === AboveBelow.Above ? 8 : -8;
  const isSingleNote = x.length === 1;

  const x1 = _getX1();
  const x2 = _getX2();
  const y1 = _getY1(1);
  const y2 = _getY2(1);
  const y1Low = _getY1(0);
  const y2Low = _getY2(0);

  const y1Near = placement === AboveBelow.Below ? y1 : y1Low;
  const y1Far = placement === AboveBelow.Below ? y1Low : y1;
  const y2Near = placement === AboveBelow.Below ? y2 : y2Low;
  const y2Far = placement === AboveBelow.Below ? y2Low : y2;

  return (
    <g>
      {!isSingleNote && (
        <polygon
          fill={stroke}
          key="p1"
          points={
            x1 +
            "," +
            y1Low +
            " " +
            x2 +
            "," +
            y2Low +
            " " +
            x2 +
            "," +
            y2 +
            " " +
            x1 +
            "," +
            y1
          }
          stroke={stroke}
          strokeWidth={0}
        />
      )}
      {!isSingleNote && (
        <line
          fill={stroke}
          key="p2"
          stroke={stroke}
          strokeWidth={bravura.engravingDefaults.tupletBracketThickness * 10}
          x1={x1 + 0.5}
          x2={x1 + 0.5}
          y1={y1Near}
          y2={y1Far + yOffset}
        />
      )}
      {!isSingleNote && (
        <line
          fill={props.stroke}
          key="p3"
          stroke={stroke}
          strokeWidth={bravura.engravingDefaults.tupletBracketThickness * 10}
          x1={x2 - 0.5}
          x2={x2 - 0.5}
          y1={y2Near}
          y2={y2Far + yOffset}
        />
      )}
      <TupletNumberView tuplet={tuplet} x1={x1} x2={x2} y1={y1} y2={y2} />
    </g>
  );
}
