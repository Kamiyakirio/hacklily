// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { chunk, isEqual, times } from "lodash";
import { Plus, Redo, Undo } from "lucide-react";
import { memo } from "react";

import { cn } from "#/lib/utils";
import type {
  Direction,
  Notations,
  TimeModification,
} from "#/musicxml-interfaces";
import {
  Count,
  MxmlAccidental,
  NormalAngledSquare,
} from "#/musicxml-interfaces";
import { Addons as SatieAddons } from "#/satie/src/satie";

export interface Props {
  accidental: MxmlAccidental;
  direction: Direction;
  dots: number;
  editType: "N" | "R" | "E" | "P";
  notation: Notations;
  note: Count;
  timeModification: TimeModification;
  newMeasure(): void;
  redo(): void;
  setAccidental(accidental: MxmlAccidental): void;
  setDirection(direction: Direction): void;
  setDots(dots: number): void;
  setEditType(editType: "N" | "R" | "E" | "P"): void;
  setNotation(notation: Notations): void;
  setNote(count: Count): void;
  setTimeModification(timeModification: TimeModification): void;
  undo(): void;
}

const dynamics: Direction[] = [
  {
    directionTypes: [
      {
        dynamics: {
          ppp: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          pp: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          p: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          mp: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          mf: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          f: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          ff: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          fff: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          fp: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          sf: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          sfz: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          sfp: true,
        },
      },
    ],
  },
  {
    directionTypes: [
      {
        dynamics: {
          rfz: true,
        },
      },
    ],
  },
];

const articulations: Notations[] = [
  {
    fermatas: [
      {
        shape: NormalAngledSquare.Normal,
      },
    ],
  },
  {
    fermatas: [
      {
        shape: NormalAngledSquare.Angled,
      },
    ],
  },
  {
    fermatas: [
      {
        shape: NormalAngledSquare.Square,
      },
    ],
  },
  {
    articulations: [
      {
        accent: {},
      },
    ],
  },
  {
    articulations: [
      {
        staccato: {},
      },
    ],
  },
  {
    articulations: [
      {
        staccatissimo: {},
      },
    ],
  },
  {
    articulations: [
      {
        tenuto: {},
      },
    ],
  },
  {
    articulations: [
      {
        staccato: {},
        tenuto: {},
      },
    ],
  },
  {
    articulations: [
      {
        accent: {},
        staccato: {},
      },
    ],
  },
  {
    articulations: [
      {
        strongAccent: {},
      },
    ],
  },
  {
    technicals: [
      {
        harmonic: {
          artificial: false,
          basePitch: null,
          natural: true,
          soundingPitch: null,
          touchingPitch: null,
        },
      },
    ],
  },
  {
    technicals: [
      {
        stopped: {},
      },
    ],
  },
  {
    technicals: [
      {
        snapPizzicato: {},
      },
    ],
  },
  {
    technicals: [
      {
        upBow: {},
      },
    ],
  },
  {
    technicals: [
      {
        downBow: {},
      },
    ],
  },
];

/**
 * Renders a list of tools that can be selected in the note editor.
 */
function NotePalette(props: Props) {
  function renderAccidentals() {
    const { accidental, editType } = props;

    function classNameForAcc(otherAccidental: MxmlAccidental): string {
      return cn(
        styles.paletteSml,
        accidental === otherAccidental && editType === "N"
          ? styles.paletteBtnOn
          : styles.paletteBtnOff,
      );
    }

    const getTypeClass: (forType: string) => string = (
      forType: string,
    ): string =>
      cn(
        styles.paletteSml,
        editType === forType ? styles.paletteBtnOn : styles.paletteBtnOff,
      );

    return (
      <span className={cn(styles.subsection)}>
        <div className={cn(styles.controlSeperator)} />
        <ul className={cn(styles.controls)}>
          <a
            href="#"
            onClick={setAccidentalNone}
            className={classNameForAcc(MxmlAccidental.Natural)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue261"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={setAccidentalF}
            className={classNameForAcc(MxmlAccidental.Flat)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue260"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={setAccidentalS}
            className={classNameForAcc(MxmlAccidental.Sharp)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue262"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={props.editType === "R" ? setTypeN : setTypeR}
            className={getTypeClass("R")}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue4e6"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={props.editType === "P" ? setTypeN : setTypeP}
            className={getTypeClass("P")}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue52f"}</span>
            </span>
          </a>
          <div className={cn(styles.controlSeperator)} />
        </ul>
      </span>
    );
  }

  function renderArticulations() {
    const { editType, notation, setNotation } = props;

    if (editType !== "P") {
      return null;
    }

    const rows = chunk(articulations, 3).map(
      (row: Notations[], idx: number) => {
        const columns = row.map((model: Notations, jdx: number) => {
          const className: string = cn(
            isEqual(notation, model)
              ? styles.paletteBtnOn
              : styles.paletteBtnOff,
          );

          return (
            <a
              href="#"
              onClick={(): void => setNotation(model)}
              key={jdx}
              className={className}
              role="button"
            >
              <SatieAddons.NotationView spec={model} />
            </a>
          );
        });

        return (
          <ul className={cn(styles.controls)} key={idx}>
            {columns}
          </ul>
        );
      },
    );

    return (
      <span className={cn(styles.subsection)}>
        <div className={cn(styles.controlSeperator)} />
        {rows}
      </span>
    );
  }

  function renderDuration() {
    const { note } = props;

    const classNameForCount: (cnt: Count) => string = (cnt: Count): string => {
      return cn(
        note === cnt && (props.editType === "N" || props.editType === "R")
          ? styles.paletteBtnOn
          : styles.paletteBtnOff,
      );
    };

    return (
      <span className={cn(styles.subsection)}>
        <div className={cn(styles.controlSeperator)} />
        <ul className={cn(styles.controls)}>
          <a
            href="#"
            onClick={setNote32}
            className={classNameForCount(Count._32nd)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ud834\udd62"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={setNote16}
            className={classNameForCount(Count._16th)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ud834\udd61"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={setNote8}
            className={classNameForCount(Count.Eighth)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ud834\udd60"}</span>
            </span>
          </a>
        </ul>
        <ul className={cn(styles.controls)}>
          <a
            href="#"
            onClick={setNote4}
            className={classNameForCount(Count.Quarter)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ud834\udd5f"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={setNote2}
            className={classNameForCount(Count.Half)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ud834\udd5e"}</span>
            </span>
          </a>
          <a
            href="#"
            onClick={setNote1}
            className={classNameForCount(Count.Whole)}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue0a2"}</span>
            </span>
          </a>
        </ul>
      </span>
    );
  }

  function renderDynamics() {
    const { direction, editType, setDirection } = props;

    if (editType !== "P") {
      return null;
    }

    const rows = chunk(dynamics, 3).map((row: Direction[], idx: number) => {
      const columns = row.map((model: Direction, jdx: number) => {
        const className: string = cn(
          isEqual(direction, model)
            ? styles.paletteBtnOn
            : styles.paletteBtnOff,
        );
        const layout: { model: Direction; overrideX?: number } = {
          model,
          overrideX: 0,
        };

        return (
          <a
            href="#"
            onClick={(): void => setDirection(model)}
            key={jdx}
            className={className}
            role="button"
          >
            <SatieAddons.Direction layout={layout} />
          </a>
        );
      });

      return (
        <ul className={cn(styles.controls)} key={idx}>
          {columns}
        </ul>
      );
    });

    return (
      <span className={cn(styles.subsection)}>
        <div className={cn(styles.controlSeperator)} />
        {rows}
      </span>
    );
  }

  function renderModifiers() {
    const { dots, timeModification } = props;

    const timeModificationTupletClassName: string = cn(
      timeModification ? styles.paletteBtnOn : styles.paletteBtnOff,
    );

    const dotEl = times(dots || 1, (idx: number) => {
      return (
        <span style={{ marginLeft: 3, display: "inline-block" }} key={idx}>
          {"\ue1e7"}
        </span>
      );
    });

    return (
      <span className={cn(styles.subsection)}>
        <div className={cn(styles.controlSeperator)} />
        <ul className={cn(styles.controls)}>
          <a
            href="#"
            onClick={toggleDots}
            className={
              dots ? cn(styles.paletteBtnOn) : cn(styles.paletteBtnOff)
            }
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">
                {"\ud834\udd5f"}
                {dotEl}
              </span>
            </span>
          </a>
          <a
            href="#"
            onClick={toggleTuplet}
            className={timeModificationTupletClassName}
            role="button"
          >
            <span className={cn(styles.bravura)}>
              <span className="mn_">{"\ue883"}</span>
            </span>
          </a>
        </ul>
      </span>
    );
  }

  function renderSecondRow() {
    if (props.editType === "P") {
      return (
        <span>
          <div className={cn(styles.controlRow)}>{renderDynamics()}</div>
          <div className={cn(styles.controlRow)}>{renderArticulations()}</div>
        </span>
      );
    }

    return null;
  }

  const setAccidentalF: () => void = () =>
    props.setAccidental(MxmlAccidental.Flat);

  const setAccidentalNone: () => void = () =>
    props.setAccidental(MxmlAccidental.Natural);

  const setAccidentalS: () => void = () =>
    props.setAccidental(MxmlAccidental.Sharp);

  const setNote1: () => void = () => props.setNote(Count.Whole);

  const setNote16: () => void = () => props.setNote(Count._16th);

  const setNote2: () => void = () => props.setNote(Count.Half);

  const setNote32: () => void = () => props.setNote(Count._32nd);

  const setNote4: () => void = () => props.setNote(Count.Quarter);

  const setNote8: () => void = () => props.setNote(Count.Eighth);

  const setTypeN: () => void = () => props.setEditType("N");

  const setTypeP: () => void = () => props.setEditType("P");

  const setTypeR: () => void = () => props.setEditType("R");

  const toggleDots: () => void = () =>
    props.setDots(((props.dots || 0) + 1) % 4);

  const toggleTuplet: () => void = () => {
    props.setTimeModification(
      props.timeModification ? null : { actualNotes: 3, normalNotes: 2 },
    );
  };

  const cls: string = cn(
    styles.paletteSml,
    styles.paletteBtnOff,
    styles.paletteTxt,
  );

  return (
    <div className={cn(styles.controlWidget)}>
      {renderSecondRow()}
      <div className={cn(styles.controlRow)}>
        {renderDuration()}
        {renderModifiers()}
        {renderAccidentals()}
        <div className={cn(styles.spring)} />
        <ul className={cn(styles.controls)}>
          <div className={cn(styles.controlSeperator)} />
          <a href="#" onClick={props.undo} className={cls} role="button">
            <Undo />
          </a>
          <div className={cn(styles.controlSeperator)} />
          <a href="#" onClick={props.redo} className={cls} role="button">
            <Redo />
          </a>
          <div className={cn(styles.controlSeperator)} />
          <a href="#" onClick={props.newMeasure} className={cls} role="button">
            <Plus /> Add Bar
          </a>
        </ul>
      </div>
    </div>
  );
}

const styles = {
  bravura: "text-[22px]",
  controlHeading: "block text-[10px] h-[10px] mb-0.5 text-center w-full",
  controlWidget:
    "bg-background border-b border-[#bebebe] border-r border-[#bebebe] bottom-[165px] flex flex-col left-[15px] absolute right-[15px]",
  controlRow:
    "border-t border-[#bebebe] flex flex-row min-h-[40px] overflow-auto",
  controlSeperator: "bg-[#bebebe] h-full w-px",
  controls: "flex list-none m-0 p-0",
  buttonBarSpacer: "w-10",
  paletteSml: "text-[22px]",
  paletteTxt: "leading-[42px]",
  paletteBtnOn:
    "bg-[rgb(0,42,74)] border-0 rounded-none text-white cursor-pointer inline-flex items-center text-[14px] h-10 leading-[36px] min-w-5 overflow-hidden px-2.5 text-center no-underline",
  paletteBtnOff:
    "bg-[#f6f7f7] border-0 rounded-none text-[rgb(0,0,238)] cursor-pointer inline-flex items-center text-[14px] h-10 leading-[36px] min-w-5 overflow-hidden px-2.5 text-center no-underline hover:bg-[rgb(26,68,100)] hover:text-white",
  spring: "flex-1",
  subsection: "flex",
} as const;

export default memo(NotePalette, isEqual);
