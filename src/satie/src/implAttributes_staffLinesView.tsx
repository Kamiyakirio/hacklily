// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { times } from "lodash";
import { useContext } from "react";

import type { StaffDetails } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import { bravura } from "./private_smufl";
import Line from "./private_views_line";

export interface IProps {
  key?: string | number;
  width: number;
  staffDetails: StaffDetails;
  defaultX: number;
  defaultY: number;
}

/**
 * Renders the (usually 5) lines that make up a staff.
 */
export default function StaffLines(props: IProps) {
  const renderContext = useContext(RenderContext);

  const middle = renderContext.originY - props.defaultY;
  const staffDetails = props.staffDetails;
  const offset = (staffDetails.staffLines - 1) / 2;
  return (
    <g>
      {times(staffDetails.staffLines, (i) => (
        <Line
          key={"staff-" + i}
          stroke="#6A6A6A"
          // TODO: Use print
          strokeWidth={bravura.engravingDefaults.staffLineThickness * 10}
          x1={props.defaultX}
          x2={props.defaultX + props.width}
          y1={middle - 10 * (i - offset)}
          y2={middle - 10 * (i - offset)}
        />
      ))}
    </g>
  );
}
