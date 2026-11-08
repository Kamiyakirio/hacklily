import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import {
  DEFAULT_SCORE_SETTINGS,
  INSTRUMENT_FAMILIES,
  INSTRUMENTS,
  KEY_SIGNATURES,
  SCORE_PRESETS,
  TEMPO_BEATS,
  createScoreSource,
  instrumentFor,
  orchestralOrder,
  partName,
  scoreSetupError,
} from "#/lib/scoreSetup";
import type {
  InstrumentFamily,
  KeyMode,
  ScorePart,
  ScorePitch,
  ScoreSetup,
} from "#/lib/scoreSetup";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

const SELECT_STYLE =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const STEPS = ["Instruments", "Score order", "Music settings", "Details"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export default function NewScoreWizard({
  onCreate,
  onHide,
}: {
  onCreate(source: string): void;
  onHide(): void;
}) {
  const [step, setStep] = useState(0);
  const [parts, setParts] = useState<ScorePart[]>([]);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<InstrumentFamily>("woodwinds");
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const [settings, setSettings] = useState({
    ...DEFAULT_SCORE_SETTINGS,
    numerator: String(DEFAULT_SCORE_SETTINGS.numerator),
    denominator: String(DEFAULT_SCORE_SETTINGS.denominator),
    tempo: String(DEFAULT_SCORE_SETTINGS.tempo),
    bars: String(DEFAULT_SCORE_SETTINGS.bars),
  });
  const setup: ScoreSetup = {
    ...settings,
    parts,
    numerator: Number(settings.numerator),
    denominator: Number(settings.denominator),
    tempo: Number(settings.tempo),
    bars: Number(settings.bars),
  };
  const validation = scoreSetupError(setup);
  const canAdvance =
    step < 2 ? parts.length > 0 && parts.length <= 64 : !validation;
  const staffCount = parts.reduce(
    (total, part) => total + instrumentFor(part).clefs.length,
    0,
  );
  const ensembleSummary = `${parts.length} ${parts.length === 1 ? "part" : "parts"} · ${staffCount} ${staffCount === 1 ? "staff" : "staves"}`;
  const key = KEY_SIGNATURES.find(
    (entry) => entry.fifths === settings.keyFifths,
  );
  const activeFamily = INSTRUMENT_FAMILIES.find((entry) => entry.id === family);
  const choices = INSTRUMENTS.filter(
    (instrument) =>
      instrument.family === family &&
      instrument.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function makePart(instrumentId: string): ScorePart {
    return { id: `score-part-${nextId.current++}`, instrumentId, name: "" };
  }
  function add(instrumentId: string) {
    const part = makePart(instrumentId);
    const rank = INSTRUMENTS.findIndex(
      (instrument) => instrument.id === instrumentId,
    );
    setParts((previous) => {
      const index = previous.findIndex(
        (entry) =>
          INSTRUMENTS.findIndex(
            (instrument) => instrument.id === entry.instrumentId,
          ) > rank,
      );
      const position = index < 0 ? previous.length : index;
      return [
        ...previous.slice(0, position),
        part,
        ...previous.slice(position),
      ];
    });
  }
  function move(index: number, direction: number) {
    setParts((previous) => {
      if (index + direction < 0 || index + direction >= previous.length)
        return previous;
      const ordered = [...previous];
      [ordered[index], ordered[index + direction]] = [
        ordered[index + direction],
        ordered[index],
      ];
      return ordered;
    });
  }
  function meter(numerator: string, denominator: string) {
    setSettings((previous) => ({
      ...previous,
      numerator,
      denominator,
      tempoBeat:
        denominator === "8" && Number(numerator) % 3 === 0 ? "4." : "4",
    }));
  }
  function advance() {
    if (!canAdvance) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    try {
      onCreate(createScoreSource(setup));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className={`flex max-h-[90dvh] flex-col sm:max-w-4xl ${step === 0 ? "h-[min(48rem,90dvh)]" : ""}`}
      >
        <DialogHeader>
          <DialogTitle>New score</DialogTitle>
          <DialogDescription>
            Build an ensemble score with instruments, musical settings, and
            score details.
          </DialogDescription>
        </DialogHeader>
        <ol
          aria-label="Score setup steps"
          className="grid grid-cols-4 gap-2 border-b pb-3 text-sm"
        >
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={
                step === index
                  ? "font-semibold text-primary"
                  : "text-muted-foreground"
              }
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            advance();
          }}
        >
          <div
            className={
              step === 0
                ? "flex min-h-0 flex-1 flex-col gap-3 p-1"
                : "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-1"
            }
          >
            {step === 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Start with a preset:
                  </span>
                  {SCORE_PRESETS.map((preset) => (
                    <Button
                      key={preset.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setParts(
                          orchestralOrder(
                            preset.parts.map((part) => ({
                              ...makePart(part.instrumentId),
                              name: part.name,
                            })),
                          ),
                        )
                      }
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <p role="status">{ensembleSummary} selected</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!parts.length}
                    onClick={() => setParts([])}
                  >
                    Clear selection
                  </Button>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[8rem_minmax(0,1fr)] overflow-hidden rounded-lg border sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <aside
                    aria-label="Instrument families"
                    className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain border-r bg-muted/30 p-2"
                  >
                    {INSTRUMENT_FAMILIES.map((entry) => {
                      const count = parts.filter(
                        (part) => instrumentFor(part).family === entry.id,
                      ).length;
                      return (
                        <Button
                          key={entry.id}
                          type="button"
                          variant={family === entry.id ? "secondary" : "ghost"}
                          aria-label={entry.label}
                          aria-pressed={family === entry.id}
                          className="h-auto min-h-9 justify-between gap-2 whitespace-normal px-2 text-left"
                          onClick={() => {
                            setFamily(entry.id);
                            setSearch("");
                          }}
                        >
                          <span>{entry.label}</span>
                          <span
                            aria-hidden="true"
                            className="min-w-5 rounded bg-background px-1 text-center text-xs tabular-nums text-muted-foreground"
                          >
                            {count}
                          </span>
                        </Button>
                      );
                    })}
                  </aside>
                  <section
                    aria-label={`${activeFamily.label} instruments`}
                    className="flex min-h-0 min-w-0 flex-col gap-3 p-3"
                  >
                    <h3 className="text-sm font-semibold">
                      {activeFamily.label}
                    </h3>
                    <Input
                      aria-label="Search instruments"
                      placeholder={`Search ${activeFamily.label.toLowerCase()}…`}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <div
                      key={family}
                      className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1"
                    >
                      <div className="grid gap-2 lg:grid-cols-2">
                        {choices.map((instrument) => {
                          const selected = parts.filter(
                            (part) => part.instrumentId === instrument.id,
                          );
                          return (
                            <div
                              key={instrument.id}
                              className="flex items-center gap-2 rounded-lg border p-2"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-auto min-h-10 min-w-0 flex-1 justify-start whitespace-normal text-left"
                                aria-label={`Add ${instrument.name}`}
                                disabled={parts.length >= 64}
                                onClick={() => add(instrument.id)}
                              >
                                <Plus />
                                <span>{instrument.name}</span>
                              </Button>
                              <span
                                className="min-w-5 text-center text-sm tabular-nums"
                                aria-label={`${instrument.name} count`}
                              >
                                {selected.length}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                aria-label={`Remove one ${instrument.name}`}
                                disabled={!selected.length}
                                onClick={() =>
                                  setParts((previous) =>
                                    previous.filter(
                                      (part) => part.id !== selected.at(-1).id,
                                    ),
                                  )
                                }
                              >
                                <Minus />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      {choices.length === 0 && (
                        <p
                          role="status"
                          className="py-6 text-center text-muted-foreground"
                        >
                          No matching instruments.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Select at least one instrument to continue. Add an
                        instrument again to create another part.
                      </p>
                    </div>
                  </section>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Move parts to customize the score order. Leave a name blank
                    to use the instrument name.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setParts(orchestralOrder(parts))}
                  >
                    Restore orchestral order
                  </Button>
                </div>
                <ol aria-label="Score order" className="space-y-2">
                  {parts.map((part, index) => {
                    const name = partName(part, parts);
                    const instrument = instrumentFor(part);
                    return (
                      <li
                        key={part.id}
                        className="flex items-center gap-2 rounded-lg border p-2"
                      >
                        <span className="w-6 text-center text-sm text-muted-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input
                            aria-label={`Part name for ${name}`}
                            value={part.name}
                            placeholder={name}
                            maxLength={100}
                            onChange={(event) =>
                              setParts((previous) =>
                                previous.map((entry) =>
                                  entry.id === part.id
                                    ? { ...entry, name: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            {
                              INSTRUMENT_FAMILIES.find(
                                (entry) => entry.id === instrument.family,
                              ).label
                            }{" "}
                            · {instrument.name} · {instrument.clefs.length}{" "}
                            {instrument.clefs.length === 1 ? "staff" : "staves"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Move ${name} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Move ${name} down`}
                          disabled={index === parts.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${name}`}
                          onClick={() =>
                            setParts((previous) =>
                              previous.filter((entry) => entry.id !== part.id),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
                {!parts.length && (
                  <p role="status">
                    No instruments selected. Go back to add instruments.
                  </p>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Concert key signature">
                    <select
                      aria-label="Concert key signature"
                      className={SELECT_STYLE}
                      value={settings.keyFifths}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          keyFifths: Number(event.target.value),
                        })
                      }
                    >
                      {KEY_SIGNATURES.map((entry) => (
                        <option key={entry.fifths} value={entry.fifths}>
                          {entry[settings.keyMode]} {settings.keyMode}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Mode">
                    <select
                      aria-label="Mode"
                      className={SELECT_STYLE}
                      value={settings.keyMode}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          keyMode: event.target.value as KeyMode,
                        })
                      }
                    >
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>
                  </Field>
                  <Field label="Beats per bar">
                    <Input
                      type="number"
                      min={1}
                      max={32}
                      step={1}
                      required
                      value={settings.numerator}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          numerator: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Beat value">
                    <select
                      aria-label="Beat value"
                      className={SELECT_STYLE}
                      value={settings.denominator}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          denominator: event.target.value,
                        })
                      }
                    >
                      {[1, 2, 4, 8, 16, 32].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label="Common time signatures"
                >
                  <span className="text-sm text-muted-foreground">
                    Common meters:
                  </span>
                  {[
                    "4/4",
                    "3/4",
                    "2/4",
                    "2/2",
                    "6/8",
                    "9/8",
                    "12/8",
                    "7/8",
                  ].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={
                        `${settings.numerator}/${settings.denominator}` ===
                        value
                      }
                      onClick={() =>
                        meter(...(value.split("/") as [string, string]))
                      }
                    >
                      {value}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tempo (BPM)">
                    <Input
                      type="number"
                      min={20}
                      max={400}
                      step={1}
                      required
                      value={settings.tempo}
                      onChange={(event) =>
                        setSettings({ ...settings, tempo: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Tempo beat unit">
                    <select
                      aria-label="Tempo beat unit"
                      className={SELECT_STYLE}
                      value={settings.tempoBeat}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          tempoBeat: event.target.value,
                        })
                      }
                    >
                      {TEMPO_BEATS.map((beat) => (
                        <option key={beat.value} value={beat.value}>
                          {beat.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tempo text (optional)">
                    <Input
                      value={settings.tempoText}
                      maxLength={100}
                      placeholder="e.g. Allegro"
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          tempoText: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Starting bars">
                    <Input
                      type="number"
                      min={1}
                      max={128}
                      step={1}
                      required
                      value={settings.bars}
                      onChange={(event) =>
                        setSettings({ ...settings, bars: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Score pitch">
                    <select
                      aria-label="Score pitch"
                      className={SELECT_STYLE}
                      value={settings.pitch}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          pitch: event.target.value as ScorePitch,
                        })
                      }
                    >
                      <option value="written">
                        Written pitch (transposed)
                      </option>
                      <option value="concert">Concert pitch</option>
                    </select>
                  </Field>
                </div>
                <p className="text-sm text-muted-foreground">
                  The selected key is the concert key. Written-pitch scores
                  adjust transposing instruments’ keys and MIDI playback. New
                  parts start with full-bar rests.
                </p>
                {validation && (
                  <p role="alert" className="text-sm text-destructive">
                    {validation}
                  </p>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title">
                    <Input
                      value={settings.title}
                      maxLength={200}
                      placeholder="Untitled"
                      onChange={(event) =>
                        setSettings({ ...settings, title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Composer">
                    <Input
                      value={settings.composer}
                      maxLength={200}
                      placeholder="Composer name"
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          composer: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <section
                  className="space-y-3 rounded-lg border p-4"
                  aria-label="Score summary"
                >
                  <h3 className="font-semibold">Score summary</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Ensemble</dt>
                    <dd>{ensembleSummary}</dd>
                    <dt className="text-muted-foreground">Concert key</dt>
                    <dd>
                      {key[settings.keyMode]} {settings.keyMode}
                    </dd>
                    <dt className="text-muted-foreground">Time signature</dt>
                    <dd>
                      {settings.numerator}/{settings.denominator}
                    </dd>
                    <dt className="text-muted-foreground">Tempo</dt>
                    <dd>
                      {
                        TEMPO_BEATS.find(
                          (beat) => beat.value === settings.tempoBeat,
                        ).label
                      }{" "}
                      = {settings.tempo} BPM
                      {settings.tempoText.trim()
                        ? ` · ${settings.tempoText.trim()}`
                        : ""}
                    </dd>
                    <dt className="text-muted-foreground">Pitch</dt>
                    <dd>
                      {settings.pitch === "written"
                        ? "Written (transposed)"
                        : "Concert"}
                    </dd>
                    <dt className="text-muted-foreground">Starting bars</dt>
                    <dd>{settings.bars}</dd>
                  </dl>
                  <ol className="list-inside list-decimal space-y-1 border-t pt-3 text-sm">
                    {parts.map((part) => (
                      <li key={part.id}>{partName(part, parts)}</li>
                    ))}
                  </ol>
                </section>
              </>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="items-center">
            <p className="mr-auto text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </p>
            <Button type="button" variant="outline" onClick={onHide}>
              Cancel
            </Button>
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            <Button type="submit" disabled={!canAdvance}>
              {step === STEPS.length - 1 ? "Create score" : "Next"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
