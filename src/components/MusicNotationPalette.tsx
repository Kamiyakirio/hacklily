import { useRef, useState } from "react";

import { MUSIC_NOTATION_GROUPS } from "#/lib/musicNotations";
import { cn } from "#/lib/utils";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

export default function MusicNotationPalette({
  onInsert,
  onHide,
}: {
  onInsert(code: string): void;
  onHide(): void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const inserted = useRef(false);
  const search = query.trim().toLocaleLowerCase();
  const groups = MUSIC_NOTATION_GROUPS.filter(
    (group) => !category || group.label === category,
  )
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${group.label} ${item.label} ${item.code}`
          .toLocaleLowerCase()
          .includes(search),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="flex max-h-[85dvh] flex-col sm:max-w-4xl"
        finalFocus={() => !inserted.current}
      >
        <DialogHeader>
          <DialogTitle>Common music symbols</DialogTitle>
          <DialogDescription>
            Select a symbol to insert its LilyPond code at the cursor or replace
            the selection. Dynamics, articulations, and slurs usually follow a
            note. Hover over a symbol for an example.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search music symbols"
          placeholder="Search by name or code, e.g. crescendo, fermata, \p"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div
          role="group"
          aria-label="Symbol categories"
          className="flex flex-wrap gap-1.5"
        >
          {[null, ...MUSIC_NOTATION_GROUPS.map((group) => group.label)].map(
            (label) => (
              <Button
                key={label || "all"}
                size="sm"
                variant={category === label ? "default" : "outline"}
                aria-pressed={category === label}
                onClick={() => setCategory(label)}
              >
                {label || "All"}
              </Button>
            ),
          )}
        </div>
        <div
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-1"
          aria-label="Music symbols"
        >
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {group.label}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.code}
                    aria-label={`Insert ${item.label}: ${item.code}`}
                    title={`Example: ${item.example}`}
                    className="grid min-h-20 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => {
                      inserted.current = true;
                      onHide();
                      onInsert(item.code);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "row-span-2 text-center",
                        item.glyph
                          ? "music-notation-glyph text-3xl"
                          : (item.symbol?.length || 0) > 2
                            ? "text-xs italic"
                            : "text-3xl",
                      )}
                    >
                      {item.glyph || item.symbol}
                    </span>
                    <span className="text-sm font-medium">{item.label}</span>
                    <code className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {item.code}
                    </code>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && (
            <p role="status" className="py-8 text-center text-muted-foreground">
              No matching music symbols.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Edit values and notes after inserting. Undo with Ctrl/Cmd+Z.
          Ritardando and a tempo insert text markings only.
        </p>
      </DialogContent>
    </Dialog>
  );
}
