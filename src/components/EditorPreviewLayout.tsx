import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { ViewMode } from "./Header";
import { MODE_BOTH } from "./Header";

const WIDTH_KEY = "hacklily.desktop.editorWidth";

function readWidth() {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(value) && value >= 20 && value <= 80) return value;
  } catch {
    // Layout preferences are optional when storage is unavailable.
  }
  return 50;
}

export default function EditorPreviewLayout({
  children,
  mode,
  windowWidth,
}: {
  children: ReactNode;
  mode: ViewMode;
  windowWidth: number;
}) {
  const [preferredWidth, setPreferredWidth] = useState(readWidth);
  const minimum = Math.min(50, Math.max(20, (240 / windowWidth) * 100));
  const maximum = 100 - minimum;
  const width = Math.max(minimum, Math.min(maximum, preferredWidth));

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(preferredWidth));
    } catch {
      // Resizing still works without persisting the preference.
    }
  }, [preferredWidth]);

  function changeWidth(value: number) {
    setPreferredWidth(Math.max(minimum, Math.min(maximum, value)));
  }

  return (
    <div
      className="content"
      style={{ "--editor-width": `${width}%` } as CSSProperties}
    >
      {children}
      {mode === MODE_BOTH && (
        <SplitHandle
          width={width}
          minimum={minimum}
          maximum={maximum}
          changeWidth={changeWidth}
        />
      )}
    </div>
  );
}

function SplitHandle({
  width,
  minimum,
  maximum,
  changeWidth,
}: {
  width: number;
  minimum: number;
  maximum: number;
  changeWidth(value: number): void;
}) {
  const [dragging, setDragging] = useState(false);
  const pointer = useRef<number | null>(null);

  useEffect(() => {
    const stop = () => {
      pointer.current = null;
      setDragging(false);
    };
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, []);

  return (
    <>
      <div
        role="separator"
        aria-label="Resize editor and preview"
        aria-orientation="vertical"
        aria-valuemin={Math.round(minimum)}
        aria-valuemax={Math.round(maximum)}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        title="Drag to resize; double-click to reset"
        className="absolute inset-y-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none select-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none"
        style={{ left: "var(--editor-width)" }}
        onPointerDown={(event) => {
          if (event.button !== 0 || pointer.current !== null) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = event.pointerId;
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (event.pointerId !== pointer.current) return;
          const bounds =
            event.currentTarget.parentElement.getBoundingClientRect();
          if (bounds.width > 0)
            changeWidth(((event.clientX - bounds.left) / bounds.width) * 100);
        }}
        onPointerUp={(event) => {
          if (event.pointerId !== pointer.current) return;
          pointer.current = null;
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          pointer.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => changeWidth(50)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 2;
          switch (event.key) {
            case "ArrowLeft":
              changeWidth(width - step);
              break;
            case "ArrowRight":
              changeWidth(width + step);
              break;
            case "Home":
              changeWidth(minimum);
              break;
            case "End":
              changeWidth(maximum);
              break;
            case "Enter":
              changeWidth(50);
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
      />
      {dragging && (
        <div className="absolute inset-0 z-30 cursor-col-resize select-none" />
      )}
    </>
  );
}
