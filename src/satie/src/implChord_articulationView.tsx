// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import type { ReactElement } from "react";
import { useContext } from "react";

import type {
  Articulations,
  Placement,
  PrintStyle,
} from "#/musicxml-interfaces";
import { AboveBelow } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import Glyph from "./private_views_glyph";

type MXMLArticulation = PrintStyle | Placement;

export interface IProps {
  articulation: Articulations;
  key?: string | number;
  defaultX?: number;
}

export default function Articulation(props: IProps) {
  const renderContext = useContext(RenderContext);

  const model = props.articulation;
  const children: ReactElement<any>[] = [];
  // Articulations not in MusicXML:
  // "articAccentStaccatoAbove": "U+E4B0",
  // "articAccentStaccatoBelow": "U+E4B1",
  // "articLaissezVibrerAbove": "U+E4BA",
  // "articLaissezVibrerBelow": "U+E4BB",
  // "articMarcatoStaccatoAbove": "U+E4AE",
  // "articMarcatoStaccatoBelow": "U+E4AF",
  // "articStaccatissimoStrokeAbove": "U+E4AA",
  // "articStaccatissimoStrokeBelow": "U+E4AB",
  // "articTenutoAccentAbove": "U+E4B4",
  // "articTenutoAccentBelow": "U+E4B5",
  // "articTenutoStaccatoBelow": "U+E4B3",
  //
  // "breathMarkSalzedo": "U+E4D5",
  // "breathMarkTick": "U+E4CF",
  // "breathMarkUpbow": "U+E4D0",
  //
  // "caesuraCurved": "U+E4D4",
  // "caesuraShort": "U+E4D3",
  // "caesuraThick": "U+E4D2",

  const append = (
    artType: MXMLArticulation,
    name: string,
    directioned = true,
  ) => {
    const printStyle = artType as PrintStyle;
    const placement = artType as Placement;
    const direction = (function () {
      if (!directioned) {
        return "";
      }
      switch (placement.placement) {
        case AboveBelow.Below:
          return "Below";
        case AboveBelow.Above:
        case AboveBelow.Unspecified:
          return "Above";
        default:
          return "Above";
      }
    })();
    children.push(
      <Glyph
        fill="black"
        glyphName={`${name}${direction}`}
        key={name}
        x={props.defaultX + printStyle.defaultX + (printStyle.relativeX || 0)}
        y={
          (renderContext.originY || 0) -
          printStyle.defaultY -
          (printStyle.relativeY || 0)
        }
      />,
    );
  };

  if (model.accent) {
    append(model.accent, "articAccent");
  }
  if (model.breathMark) {
    append(model.breathMark, "breathMarkComma", false);
  }
  if (model.caesura) {
    append(model.caesura, "caesura", false);
  }
  if (model.detachedLegato) {
    append(model.detachedLegato, "articTenutoStaccato");
  }
  if (model.doit) {
    // TODO: hope some bass rendering library comes along and saves us ...
  }
  if (model.falloff) {
    // ...
  }
  if (model.plop) {
    // ...
  }
  if (model.scoop) {
    // ...
  }
  if (model.spiccato) {
    append(model.spiccato, "articStaccatissimoWedge");
  }
  if (model.staccatissimo) {
    append(model.staccatissimo, "articStaccatissimo");
  }
  if (model.staccato) {
    append(model.staccato, "articStaccato");
  }
  if (model.stress) {
    append(model.stress, "articStress");
  }
  if (model.strongAccent) {
    append(model.strongAccent, "articMarcato");
  }
  if (model.tenuto) {
    append(model.tenuto, "articTenuto");
  }
  if (model.unstress) {
    append(model.unstress, "articUnstress");
  }

  switch (children.length) {
    case 0:
      return null;
    case 1:
      return children[0];
    default:
      return <g>{children}</g>;
  }
}
