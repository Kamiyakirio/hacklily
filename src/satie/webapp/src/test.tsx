import { Link } from "@tanstack/react-router";
/* eslint-disable no-shadow */
import { find } from "lodash";
import { useEffect, useState } from "react";

import type { ISong } from "../../src/satie";
import { Application, Song } from "../../src/satie";
import { prefix } from "./config";

import STYLES from "./test.module.css";

export const satieApplication = new Application({
  satieRoot: location.protocol + "//" + location.host + prefix + "/vendor/",
  preloadedFonts: ["Alegreya", "Alegreya (bold)"],
});

export interface IProps {
  key?: string | number;
  chrome?: boolean;
  name: string;
  showFilterButton?: boolean;
  filename: string;
  singleLine: boolean;
}

export interface IState {
  filename?: string;
  src?: string;
  error?: Error;
  loaded?: boolean;
}

export default function Test(props: IProps) {
  const [source, setSource] = useState<IState>({
    filename: props.filename,
    src: null,
    loaded: false,
  });
  const [songHandle, setSongHandle] = useState<ISong | null>(null);
  const current: IState =
    source.filename === props.filename
      ? source
      : { filename: props.filename, loaded: false };
  const currentSong = source.filename === props.filename ? songHandle : null;

  useEffect(() => {
    const controller = new AbortController();
    const filename = props.filename;
    const prefix = process.env.PLAYGROUND_PREFIX || "";
    async function load() {
      try {
        const response = await fetch(prefix + filename, {
          signal: controller.signal,
        });
        const src = await response.text();
        if (controller.signal.aborted) return;
        setSource({
          filename,
          src,
          loaded: false,
          error: response.ok
            ? undefined
            : new Error("Status: " + response.status + "\n" + src),
        });
      } catch (error) {
        if (!controller.signal.aborted)
          setSource({
            filename,
            loaded: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [props.filename]);

  function handleError(error: Error) {
    setSource((previous) =>
      previous.filename === props.filename
        ? { ...previous, error, loaded: false }
        : previous,
    );
  }
  function handleLoaded() {
    setSource((previous) =>
      previous.filename === props.filename
        ? { ...previous, loaded: true }
        : previous,
    );
  }

  const isSingleLine = props.singleLine;
  const chrome = props.chrome !== false;
  const showFilterButton = chrome && props.showFilterButton;
  const link = showFilterButton ? (
    <Link
      to={`/satie/tests/${props.name}/?mode=${
        isSingleLine ? "singleline" : "page"
      }`}
    >
      <button>hide others</button>
    </Link>
  ) : null;
  if (current.error) {
    const errStr = "" + (current.error as any).stack.toString();
    const lines = errStr.split("\n").map((s, idx) => <div key={idx}>{s}</div>);
    return (
      <div className={STYLES.test}>
        <h3>
          Test {current.filename}&nbsp;&nbsp;{link}
        </h3>
        <code className={STYLES.error}>{lines}</code>
      </div>
    );
  }

  const misc =
    chrome && currentSong && currentSong.header.identification.miscellaneous;
  const descriptionField =
    chrome &&
    find(
      misc && misc.miscellaneousFields,
      (field) => field.name === "description",
    );
  const description =
    chrome &&
    (descriptionField ? descriptionField.data : <p>No description.</p>);
  const title = chrome && (
    <h3>
      Test {current.filename}&nbsp;&nbsp;{link}
    </h3>
  );
  return (
    <div className={STYLES.test}>
      {title}
      {description}
      {!current.loaded && <div>Loading...</div>}
      <br />
      {current.src && (
        <Song
          baseSrc={current.src}
          ref={setSongHandle}
          onError={handleError}
          onLoaded={handleLoaded}
          pageClassName={!props.singleLine && STYLES.page}
          singleLineMode={props.singleLine}
        />
      )}
    </div>
  );
}
