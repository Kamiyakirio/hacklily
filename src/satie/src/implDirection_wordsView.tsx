// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
/* eslint-disable no-shadow */
import { map } from "lodash";
import { useContext } from "react";

import type { Direction } from "#/musicxml-interfaces";
import { NormalBold, NormalItalic } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import { cssSizeToTenths } from "./private_renderUtil";
import { createTextHelpers } from "./private_views_textMixin";

export interface IProps {
  layout: { model: Direction; overrideX?: number };
  key?: string | number;
}

export default function WordsView(props: IProps) {
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

  const layout = props.layout;
  const model = layout.model;
  const wordsContainer = model.directionTypes.filter((dt) => dt.words)[0];
  invariant(!!wordsContainer, "No words found!");
  const words =
    typeof wordsContainer !== "number" &&
    typeof wordsContainer !== "function" &&
    wordsContainer.words;

  const initX = props.layout.overrideX;
  const initY =
    renderContext.originY - words[0].defaultY - (words[0].relativeY || 0);
  const scale40 = renderContext.scale40;

  return (
    <text x={initX} y={initY}>
      {map(words, (words, idx) => {
        const isBold = words.fontWeight === NormalBold.Bold;
        const isItalic = words.fontStyle === NormalItalic.Italic;
        const fontSize = cssSizeToTenths(scale40, words.fontSize);

        return map(words.data.split("\n"), (line, lineNum) => (
          <tspan
            alignmentBaseline="hanging"
            fill={words.color || "black"}
            direction={getDirection(words)}
            dx={getDX(words, 0, lineNum)}
            dy={getDY(words, initY, lineNum)}
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
