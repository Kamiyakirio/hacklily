// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
/* eslint-disable no-shadow */
import { map } from "lodash";
import { useContext } from "react";

import type { Credit } from "#/musicxml-interfaces";
import { NormalBold, NormalItalic } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import { cssSizeToTenths } from "./private_renderUtil";
import { createTextHelpers } from "./private_views_textMixin";

export default function CreditView(props: Credit) {
  const renderContext = useContext(RenderContext);
  const {
    getTextAnchor,
    getTextDecoration,
    getTransform,
    getDirection,
    getX,
    getDX,
    getDY,
  } = createTextHelpers(renderContext);

  const image = props.creditImage;
  const words = props.creditWords;
  const scale40 = renderContext.scale40;
  invariant(!image, "Not implemented"); // There is either words or image, but not both
  invariant(!!words, "Unknown component type");

  if (!!words && !words.length) {
    return <g />;
  }
  const initX = words[0].defaultX + (words[0].relativeX || 0);
  const initY =
    renderContext.originY - (words[0].defaultY + (words[0].relativeY || 0));

  return (
    <text x={initX} y={initY}>
      {map(words, (words, idx) => {
        const isItalic = words.fontStyle === NormalItalic.Italic;
        const isBold = words.fontWeight === NormalBold.Bold;
        const fontSize = cssSizeToTenths(scale40, words.fontSize);
        return map(words.words.split("\n"), (line, lineNum) => (
          <tspan
            alignmentBaseline="hanging"
            fill={words.color || "black"}
            direction={getDirection(words)}
            dx={getDX(words, initX, lineNum as any)}
            dy={getDY(words, initY, lineNum as any)}
            fontStyle={isItalic ? "italic" : "normal"}
            fontWeight={isBold ? "bold" : "normal"}
            fontFamily={words.fontFamily || "Alegreya"}
            fontSize={fontSize}
            key={idx + "l" + lineNum}
            letterSpacing={
              words.letterSpacing && words.letterSpacing !== "normal"
                ? "" +
                  cssSizeToTenths(renderContext.scale40, words.letterSpacing)
                : "normal"
            }
            textDecoration={getTextDecoration(words)}
            textAnchor={getTextAnchor(words)}
            transform={getTransform(words)}
            x={getX(lineNum)}
          >
            {line}
          </tspan>
        ));
      })}
    </text>
  );
}
