"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { formatTimestamp, parseTimestamp } from "../../lib/format-timestamp";

const STEP_SECONDS = 5;

interface TimestampFieldProps {
  id: string;
  /** Starting value; the field owns the text state after mount. */
  initialSeconds: number;
  /** Upper bound (audiobook duration). Null/undefined = unbounded. */
  max?: number | null;
  disabled?: boolean;
  /** Fires on every change with the parsed seconds, or null when invalid. */
  onParsedChange: (seconds: number | null) => void;
}

/**
 * H:MM:SS text input flanked by ±5s stepper buttons. The steppers and typed
 * input only mutate local state — committing the value is the parent's job.
 */
export function TimestampField({
  id,
  initialSeconds,
  max,
  disabled,
  onParsedChange,
}: TimestampFieldProps) {
  const t = useTranslations("common.timestampField");
  const [text, setText] = useState(() => formatTimestamp(initialSeconds));

  const parsed = parseTimestamp(text);
  const beyondEnd = parsed !== null && max != null && parsed > max;
  const invalid = parsed === null || beyondEnd;

  const emitChange = (nextText: string) => {
    setText(nextText);
    const nextParsed = parseTimestamp(nextText);
    const nextBeyondEnd =
      nextParsed !== null && max != null && nextParsed > max;
    onParsedChange(nextParsed === null || nextBeyondEnd ? null : nextParsed);
  };

  const step = (delta: number) => {
    if (parsed === null) return;
    const upperBound = max ?? Number.POSITIVE_INFINITY;
    const next = Math.min(Math.max(parsed + delta, 0), upperBound);
    emitChange(formatTimestamp(next));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("label")}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => step(-STEP_SECONDS)}
          disabled={disabled || parsed === null || parsed <= 0}
          aria-label={t("subtractSeconds", { seconds: STEP_SECONDS })}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Input
          id={id}
          value={text}
          onChange={(event) => emitChange(event.target.value)}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className="h-8 text-center tabular-nums"
          aria-invalid={invalid || undefined}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => step(STEP_SECONDS)}
          disabled={
            disabled || parsed === null || (max != null && parsed >= max)
          }
          aria-label={t("addSeconds", { seconds: STEP_SECONDS })}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {invalid && (
        <p className="text-xs text-destructive" role="alert">
          {beyondEnd ? t("beyondEnd") : t("invalid")}
        </p>
      )}
    </div>
  );
}
