// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import type { Position } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";

export interface IProps {
  spec: Position;
  barNumber: string;
  key?: string | number;
}

export default function BarNumber(props: IProps) {
  const renderContext = useContext(RenderContext);

  const spec = props.spec;
  return (
    <text
      className="bn_"
      fontSize={24}
      x={spec.defaultX + (spec.relativeX || 0)}
      y={renderContext.originY - spec.defaultY - (spec.relativeY || 0)}
    >
      {props.barNumber}
    </text>
  );
}
