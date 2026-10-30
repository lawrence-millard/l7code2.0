import type { ReactNode } from "react";

import { L7CodeWordmark } from "../L7Wordmark";
import { cn } from "~/lib/utils";

/**
 * Zeron-style new-session canvas: L7 brand is the hero signal, then one
 * space picker and supporting line. Composer mounts below via ChatView.
 */
export function NewSessionCanvas({
  spacePicker,
  supporting,
  className,
}: {
  readonly spacePicker: ReactNode;
  readonly supporting?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 pt-4 sm:pt-8",
        className,
      )}
      data-l7-new-session-canvas=""
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <L7CodeWordmark className="h-12 w-auto text-foreground sm:h-14" />
        <p className="max-w-md font-[family-name:var(--font-brand)] text-lg text-muted-foreground tracking-tight sm:text-xl">
          New session
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-3">
        <div className="surface-frost flex w-full max-w-xl items-center justify-center rounded-2xl border border-(--frost-sidebar-border) px-4 py-3 shadow-[0_12px_40px_-24px_rgb(0_0_0/35%)]">
          <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center text-base text-foreground sm:text-lg">
            <span className="text-muted-foreground">Space</span>
            <span className="min-w-0 font-medium">{spacePicker}</span>
          </div>
        </div>
        {supporting ? (
          <div className="flex min-h-6 items-center justify-center text-sm text-muted-foreground">
            {supporting}
          </div>
        ) : null}
      </div>
    </div>
  );
}
