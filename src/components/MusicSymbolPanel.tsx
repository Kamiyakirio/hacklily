import { X } from "lucide-react";
import { useState } from "react";

import { MUSIC_NOTATION_GROUPS } from "#/lib/musicNotations";
import type { MusicNotation } from "#/lib/musicNotations";
import { cn } from "#/lib/utils";

import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export default function MusicSymbolPanel({
  selectedNoteCount,
  disabled,
  onUseNotation,
  onHide,
}: {
  selectedNoteCount: number;
  disabled: boolean;
  onUseNotation(notation: MusicNotation): boolean;
  onHide(): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(MUSIC_NOTATION_GROUPS[0].label);
  const applying = selectedNoteCount > 0;

  return (
    <section
      aria-label="Music symbol panel"
      className="music-symbol-panel shrink-0 border-b border-black bg-toolbar text-foreground"
    >
      <Tabs
        value={category}
        onValueChange={(value) => {
          setCategory(String(value));
          setError(null);
        }}
        className="gap-0"
      >
        <div className="flex min-w-0 items-center gap-2 px-4 pb-1">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TabsList
              aria-label="Music symbol categories"
              className="h-8 justify-start gap-1 rounded-none bg-transparent p-0"
            >
              {MUSIC_NOTATION_GROUPS.map((group) => (
                <TabsTrigger
                  key={group.label}
                  value={group.label}
                  render={<Button variant="outline" size="sm" />}
                  className="h-7 flex-none border-border px-2.5 text-foreground after:hidden data-active:bg-muted data-active:text-foreground data-active:shadow-none dark:data-active:bg-muted"
                >
                  {group.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Hide music symbol panel"
            title="Hide music symbol panel"
            onClick={onHide}
          >
            <X />
          </Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-2">
          {MUSIC_NOTATION_GROUPS.map((group) => (
            <TabsContent
              key={group.label}
              value={group.label}
              className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
            >
              <div
                role="group"
                aria-label={group.label}
                className="grid w-max grid-flow-col grid-rows-2 gap-0.5 p-0.5"
              >
                {group.items.map((item) => {
                  const label = applying
                    ? item.selectionLabel || item.label
                    : item.label;
                  const needsRange =
                    item.application === "span" ||
                    item.application === "between";
                  const unavailable =
                    applying &&
                    ((needsRange && selectedNoteCount < 2) ||
                      (item.application === "tremoloPair" &&
                        selectedNoteCount !== 2));
                  return (
                    <Button
                      variant="outline"
                      size="icon"
                      type="button"
                      key={item.code}
                      aria-label={`${applying ? "Apply" : "Insert"} ${label}: ${item.code}`}
                      title={
                        unavailable
                          ? item.application === "tremoloPair"
                            ? `${label} — select exactly two adjacent notes`
                            : `${label} — select at least two notes`
                          : `${label} · ${item.code}\nExample: ${item.example}`
                      }
                      disabled={disabled || unavailable}
                      className="relative h-8 w-auto min-w-9 px-2 text-foreground"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setError(
                          onUseNotation(item)
                            ? null
                            : "This symbol needs a compatible note selection. Check the symbol’s tooltip and select the notes again.",
                        )
                      }
                    >
                      <NotationSymbol notation={item} />
                    </Button>
                  );
                })}
              </div>
            </TabsContent>
          ))}
          <p
            role="status"
            className="w-full text-xs text-muted-foreground sm:w-auto"
          >
            {applying ? (
              <>
                <span className="font-medium text-foreground">
                  {selectedNoteCount}{" "}
                  {selectedNoteCount === 1 ? "note" : "notes"} selected
                </span>
                <span className="hidden sm:block">Click a symbol to apply</span>
              </>
            ) : (
              <>
                <span>Select notes to apply</span>
                <span className="hidden sm:block">
                  Or click to insert at the cursor
                </span>
              </>
            )}
          </p>
        </div>
      </Tabs>
      {error && (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function NotationSymbol({ notation }: { notation: MusicNotation }) {
  const { code } = notation;
  if (
    notation.application === "tremolo" ||
    notation.application === "tremoloPair"
  ) {
    const strokes = Math.log2(notation.tremoloDivision) - 2;
    const pair = notation.application === "tremoloPair";
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 40 36"
        className="size-7 fill-current stroke-current"
        strokeWidth="1.2"
      >
        {pair ? (
          <>
            <ellipse
              cx="7"
              cy="29"
              rx="4.5"
              ry="3"
              transform="rotate(-20 7 29)"
            />
            <ellipse
              cx="29"
              cy="25"
              rx="4.5"
              ry="3"
              transform="rotate(-20 29 25)"
            />
            <path d="M11 29V4M33 25V4" fill="none" />
            {Array.from({ length: strokes }, (_, i) => (
              <path
                key={i}
                d={`M11 ${6 + i * 5} 33 ${6 + i * 5}`}
                strokeWidth="2.5"
              />
            ))}
          </>
        ) : (
          <>
            <ellipse
              cx="19"
              cy="29"
              rx="4.5"
              ry="3"
              transform="rotate(-20 19 29)"
            />
            <path d="M23 29V3" fill="none" />
            {Array.from({ length: strokes }, (_, i) => (
              <path
                key={i}
                d={`M16 ${10 + i * 4} 30 ${4 + i * 4}`}
                strokeWidth="2.5"
              />
            ))}
          </>
        )}
      </svg>
    );
  }
  const hairpin = code === "\\<" || code === "\\>";
  const slur =
    code === "(" ||
    code === ")" ||
    code === "~" ||
    code === "\\(" ||
    code === "\\)";
  const beam = code === "[" || code === "]";
  if (hairpin || slur || beam) {
    return (
      <>
        <svg
          aria-hidden="true"
          viewBox="0 0 40 32"
          className="size-7 fill-none stroke-current"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {hairpin ? (
            <path d={code === "\\<" ? "M35 8 5 16 35 24" : "M5 8 35 16 5 24"} />
          ) : beam ? (
            <>
              <path d="M10 24V9L30 5V20" />
              <path d="m10 9 20-4v4l-20 4Z" fill="currentColor" stroke="none" />
              <ellipse
                cx="6"
                cy="24"
                rx="4"
                ry="2.5"
                fill="currentColor"
                stroke="none"
              />
              <ellipse
                cx="26"
                cy="20"
                rx="4"
                ry="2.5"
                fill="currentColor"
                stroke="none"
              />
            </>
          ) : (
            <path
              d={code === "~" ? "M5 14Q20 26 35 14" : "M5 22C10 5 30 5 35 22"}
            />
          )}
        </svg>
        {(code === ")" || code === "]" || code === "\\)") && (
          <span
            aria-hidden="true"
            className="absolute bottom-0 right-0.5 bg-background px-0.5 text-[9px] leading-3 text-muted-foreground"
          >
            end
          </span>
        )}
      </>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        /^\\[1-6]$/.test(code) &&
          "flex size-6 items-center justify-center rounded-full border border-current text-sm!",
        notation.glyph
          ? "music-notation-glyph text-[22px]"
          : (notation.symbol?.length || 0) > 2
            ? "font-serif text-sm italic"
            : "text-2xl",
      )}
    >
      {notation.glyph || notation.symbol}
    </span>
  );
}
