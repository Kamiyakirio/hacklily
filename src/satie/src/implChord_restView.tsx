// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
import { map } from "lodash";
import { useContext } from "react";

import type { MultipleRest, Note } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import { bboxes } from "./private_smufl";
import Dot from "./private_views_dot";
import Glyph from "./private_views_glyph";

export interface IProps {
  multipleRest?: MultipleRest;
  notehead?: string;
  spec: Note;
}

/**
 * Renders a rest.
 */
export default function Rest(props: IProps) {
  const renderContext = useContext(RenderContext);

  const spec = props.spec;
  if (spec.printObject === false) {
    return null;
  }
  const rest = spec.rest;
  invariant(!!spec.rest, "Attempting to render a non-rest with Rest");
  const notehead = props.notehead;

  const x = spec.defaultX + (spec.relativeX || 0);
  const y = renderContext.originY - (spec.defaultY + (spec.relativeY || 0));
  const dotOffset = bboxes[notehead][0] * 10 + 6;

  return (
    <g>
      <Glyph fill={spec.color} glyphName={notehead} key="R" x={x} y={y} />
      {rest.measure && props.multipleRest && (
        <text
          className="mmn_"
          fontWeight="bold"
          fontSize={48}
          textAnchor="middle"
          x={x + (bboxes[notehead][0] * 10) / 2}
          y={y - 30}
        >
          {props.multipleRest.count /*TODO: useSymbols*/}
        </text>
      )}
      {spec.dots && spec.printDot !== false
        ? map(spec.dots, (dot, idx) => (
            <Dot
              fill={dot.color}
              key={idx + "d"}
              radius={2.4}
              x={x + dotOffset + 6 * idx}
              y={y - (dot.defaultY + (dot.relativeY || 0))}
              // y: y + (line - 3)*10 + (((line * 2) % 2) ? 0 : 5)
            />
          ))
        : null}
    </g>
  );
}
