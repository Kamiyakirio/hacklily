// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { map } from "lodash";
import { useContext } from "react";

import type { Direction } from "#/musicxml-interfaces";

import Dynamics from "./implDirection_dynamicsView";
import Words from "./implDirection_wordsView";
import { RenderContext } from "./private_renderContext";
import Glyph from "./private_views_glyph";

export default function DirectionView(props: {
  layout: { model: Direction; overrideX?: number };
}) {
  const renderContext = useContext(RenderContext);

  const model = props.layout.model;
  const children = map(model.directionTypes, (type, idx) => {
    switch (true) {
      case !!type.accordionRegistration:
        return null;
      case !!type.bracket:
        return null;
      case !!type.codas:
        return null;
      case !!type.damp:
        return null;
      case !!type.dampAll:
        return null;
      case !!type.dashes:
        return null;
      case !!type.dynamics:
        return <Dynamics key={`d_${idx}`} layout={props.layout} />;
      case !!type.eyeglasses:
        return null;
      case !!type.harpPedals:
        return null;
      case !!type.image:
        return null;
      case !!type.metronome:
        return null;
      case !!type.octaveShift:
        return null;
      case !!type.otherDirection:
        return null;
      case !!type.pedal:
        return null;
      case !!type.percussions:
        return null;
      case !!type.principalVoice:
        return null;
      case !!type.rehearsals:
        return null;
      case !!type.scordatura:
        return null;
      case !!type.segnos:
        return (
          <g>
            {map(type.segnos, (segno, segnoIdx) => (
              <Glyph
                glyphName="segno"
                key={segnoIdx}
                x={
                  props.layout.overrideX +
                  segno.defaultX +
                  (segno.relativeX || 0)
                }
                y={
                  (renderContext.originY || 0) -
                  segno.defaultY -
                  (segno.relativeY || 0)
                }
                fill={segno.color}
              />
            ))}
          </g>
        );
      case !!type.stringMute:
        return null;
      case !!type.wedge:
        return null;
      case !!type.words:
        return <Words key={`d_${idx}`} layout={props.layout} />;
      default:
        throw new Error("Invalid direction in " + type); // eslint-disable-line @typescript-eslint/no-base-to-string
    }
  }).filter((el) => !!el);

  switch (children.length) {
    case 0:
      return null;
    case 1:
      return children[0];
    default:
      return <g>{children}</g>;
  }
}
