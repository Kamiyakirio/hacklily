// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { map, times } from "lodash";
import { useContext } from "react";

import type { IBeamLayout } from "./implChord_beamLayout";
import TupletNumber from "./implChord_tupletNumberView";
import { RenderContext } from "./private_renderContext";
import { bravura, getFontOffset } from "./private_smufl";

export interface IProps {
  key?: string | number;
  layout: IBeamLayout;
  stemWidth: number;
  stroke: string;
}

/**
 * Renders a beam based on a computed layout.
 */
export default function Beam(props: IProps) {
  const renderContext = useContext(RenderContext);
  function getLineXOffset() {
    return (props.layout.direction * -props.stemWidth) / 2;
  }

  function _withXOffset(x: number) {
    // Note that we use notehadBlack regardless of the notehead.
    // This keeps spacing consistent, even in beam groups with rests.

    return (
      x +
      getFontOffset("noteheadBlack", props.layout.direction)[0] * 10 +
      getLineXOffset()
    );
  }

  function _getX1() {
    return _withXOffset(props.layout.x[0]);
  }

  function _getX2() {
    return _withXOffset(props.layout.x[props.layout.x.length - 1]);
  }

  function _getY1(incl: number, idx: number) {
    // Note that we use notehadBlack regardless of the notehead.
    // This keeps spacing consistent, even in beam groups with rests.
    return (
      renderContext.originY -
      props.layout.y1 -
      _getYOffset() +
      props.layout.direction * idx * 8.8 -
      // TODO: use print defaults
      (incl || 0) * (bravura.engravingDefaults.beamThickness * 10)
    );
  }

  function _getY2(incl: number, idx: number) {
    // Note that we use notehadBlack regardless of the notehead.
    // This keeps spacing consistent, even in beam groups with rests.
    return (
      renderContext.originY -
      props.layout.y2 -
      _getYOffset() +
      props.layout.direction * idx * 8.8 -
      (incl || 0) * (bravura.engravingDefaults.beamThickness * 10)
    );
  }

  function _getYVar(incl: number, idx: number, percent: number) {
    const y1 = _getY1(incl, idx);
    const y2 = _getY2(incl, idx);
    return (1 - percent) * y1 + percent * y2;
  }

  function _getYOffset() {
    return -3;
  }

  const xLow = _getX1();
  const xHigh = _getX2();
  const { layout } = props;
  const { tuplet, beamCount, x, direction } = layout;

  return (
    <g>
      {map(beamCount, (beams: number, idx: number): any => {
        return times(beams, (beam) => {
          let x1: number;
          let x2: number = _withXOffset(x[idx]);
          if (beamCount[idx - 1] <= beam) {
            if (x[idx + 1] && beamCount[idx + 1] === beams) {
              return null;
            }
            x1 = _withXOffset((x[idx - 1] + x[idx] * 3) / 4);

            if (idx === 0) {
              return null;
            }
          } else if (
            beamCount[idx + 1] <= beam &&
            (!x[idx + 1] || beamCount[idx - 1] !== beams)
          ) {
            x1 = _withXOffset(x[idx]);
            x2 = _withXOffset((x[idx + 1] + x[idx] * 3) / 4);
          } else {
            x1 = _withXOffset(x[idx - 1]);

            if (idx === 0) {
              return null;
            }
          }
          return (
            <polygon
              fill={props.stroke}
              key={idx + "_" + beam}
              points={
                x1 +
                "," +
                _getYVar(0, beam, (x1 - xLow) / (xHigh - xLow)) +
                " " +
                x2 +
                "," +
                _getYVar(0, beam, (x2 - xLow) / (xHigh - xLow)) +
                " " +
                x2 +
                "," +
                _getYVar(1, beam, (x2 - xLow) / (xHigh - xLow)) +
                " " +
                x1 +
                "," +
                _getYVar(1, beam, (x1 - xLow) / (xHigh - xLow))
              }
              stroke={props.stroke}
              strokeWidth={0}
            />
          );
        });
      })}
      {tuplet && (
        <TupletNumber
          tuplet={tuplet}
          x1={xLow}
          x2={xHigh}
          y1={_getYVar(0, -1, 0) - (direction >= 1 ? 8.5 : -1.8)}
          y2={_getYVar(0, -1, 1) - (direction >= 1 ? 8.5 : -1.8)}
        />
      )}
    </g>
  );
}
