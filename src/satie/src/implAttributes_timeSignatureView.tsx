// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { map } from "lodash";
import { useContext } from "react";

import type { Time } from "#/musicxml-interfaces";
import { TimeSymbolType } from "#/musicxml-interfaces";

import { NUMBER_SPACING, PLUS_SPACING } from "./implAttributes_attributesData";
import { RenderContext } from "./private_renderContext";
import Glyph from "./private_views_glyph";

/* private */
function TimeSignatureNumber(props: ITSNumProps) {
  return (
    <g>
      {map(String(props.children).split(""), (numberString, i) => (
        <Glyph
          fill={props.stroke}
          glyphName={"timeSig" + numberString}
          key={"ts-" + i}
          x={
            props.x +
            i * 12 +
            (numberString === "1"
              ? !i && parseInt(props.children, 10) >= 10
                ? -1
                : 1
              : 0)
          }
          y={props.y}
        />
      ))}
    </g>
  );
}

/**
 * Renders a simple, compound, or common time signature.
 */
export default function TimeSignatureView(props: {
  spec: Time;
  key?: string | number;
}) {
  const renderContext = useContext(RenderContext);
  function getNumOffsets() {
    // This is sketchy.
    const ts = _displayTimeSignature();
    return map(ts.beats, (beats, idx) => {
      if (beats.length > 1) {
        return 0;
      }
      let culm = 0;
      if (beats[0] < 10 && ts.beatType[idx] >= 10) {
        culm += 5;
      }
      return culm;
    });
  }

  function getDenOffsets() {
    // This is sketchy.
    const ts = _displayTimeSignature();

    return map(ts.beatType, (beatType, idx) => {
      let culm = 0;
      const numToDenOffset = ((ts.beats[idx].length - 1) * NUMBER_SPACING) / 2;
      culm += numToDenOffset;
      if (ts.beats[idx][0] >= 10 && beatType < 10) {
        culm += 7;
      }

      return culm;
    });
  }

  function _displayTimeSignature() {
    const spec = props.spec;
    return {
      beatType: spec.beatTypes,
      beats: map(spec.beats, (beats) =>
        beats.split("+").map((n) => parseInt(n, 10)),
      ),
      commonRepresentation:
        spec.symbol === TimeSymbolType.Common ||
        spec.symbol === TimeSymbolType.Cut,
      singleNumber: spec.symbol === TimeSymbolType.SingleNumber,
    };
  }

  const spec = props.spec;
  if (spec.senzaMisura != null) {
    return null;
  }
  const ts = _displayTimeSignature();
  if (ts.singleNumber && ts.beats.length === 1 && ts.beats[0].length === 1) {
    return (
      <TimeSignatureNumber
        stroke={spec.color}
        x={spec.defaultX + (spec.relativeX || 0)}
        y={
          (renderContext.originY || 0) - (spec.defaultY + (spec.relativeY || 0))
        }
      >
        {String(ts.beats[0])}
      </TimeSignatureNumber>
    );
  }

  if (ts.commonRepresentation) {
    const beats = ts.beats;
    const beatType = ts.beatType;

    const hasSingleBeat = beats.length === 1 && beats[0].length === 1;

    const isCommon = hasSingleBeat && beats[0][0] === 4 && beatType[0] === 4;
    const isCut = hasSingleBeat && beats[0][0] === 2 && beatType[0] === 2;

    if (isCommon) {
      return (
        <Glyph
          fill={spec.color}
          glyphName="timeSigCommon"
          x={spec.defaultX + (spec.relativeX || 0)}
          y={
            (renderContext.originY || 0) -
            (spec.defaultY + (spec.relativeY || 0))
          }
        />
      );
    } else if (isCut) {
      return (
        <Glyph
          fill={spec.color}
          glyphName="timeSigCutCommon"
          x={spec.defaultX + (spec.relativeX || 0)}
          y={
            (renderContext.originY || 0) -
            (spec.defaultY + (spec.relativeY || 0))
          }
        />
      );
    }
    // Cannot be represented in common representation. Pass through.
  }

  const numOffsets = getNumOffsets();
  const denOffsets = getDenOffsets();

  return (
    <g>
      {map(ts.beats, (beatsOuter, idx) => {
        const pos = ts.beats
          .slice(0, idx)
          .reduce(
            (sum, group) => sum + group.length * NUMBER_SPACING + PLUS_SPACING,
            0,
          );
        const array = [
          map(beatsOuter, (beats, jdx) => [
            <TimeSignatureNumber
              key={`num_${idx}_${jdx}`}
              stroke={spec.color}
              x={
                spec.defaultX +
                (spec.relativeX || 0) +
                numOffsets[idx] +
                pos +
                jdx * NUMBER_SPACING
              }
              y={
                (renderContext.originY || 0) -
                (spec.defaultY + (spec.relativeY || 0) + 10)
              }
            >
              {String(beats)}
            </TimeSignatureNumber>,
            jdx + 1 !== beatsOuter.length && (
              <Glyph
                fill="black"
                glyphName="timeSigPlusSmall"
                key={`num_plus_numerator_${idx}_${jdx}`}
                x={
                  spec.defaultX +
                  (spec.relativeX || 0) +
                  numOffsets[idx] +
                  pos +
                  jdx * NUMBER_SPACING +
                  17
                }
                y={
                  (renderContext.originY || 0) -
                  spec.defaultY +
                  (spec.relativeY || 0) -
                  10
                }
              />
            ),
          ]),
          <TimeSignatureNumber
            key="den"
            stroke={spec.color}
            x={spec.defaultX + (spec.relativeX || 0) + denOffsets[idx] + pos}
            y={
              (renderContext.originY || 0) -
              (spec.defaultY + (spec.relativeY || 0) - 10)
            }
          >
            {String(ts.beatType[idx])}
          </TimeSignatureNumber>,
          idx + 1 !== ts.beats.length && (
            <Glyph
              fill="black"
              glyphName="timeSigPlus"
              key={`num_plus_${idx}`}
              x={
                spec.defaultX +
                (spec.relativeX || 0) +
                numOffsets[idx] +
                pos +
                beatsOuter.length * NUMBER_SPACING -
                10
              }
              y={
                (renderContext.originY || 0) -
                spec.defaultY +
                (spec.relativeY || 0)
              }
            />
          ),
        ];
        return array;
      })}
    </g>
  );
}

/* private */
interface ITSNumProps {
  key?: string | number;
  x: number;
  y: number;
  stroke: string;
  children?: string;
}
