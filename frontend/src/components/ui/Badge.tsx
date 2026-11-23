import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "positive" | "warning" | "critical";

const TONES: Record<Tone, string> = {
  neutral: "bg-neutral-dim text-ink-muted border-line-strong",
  brand: "bg-brand-dim text-brand border-brand/30",
  positive: "bg-positive-dim text-positive border-positive/30",
  warning: "bg-warning-dim text-warning border-warning/30",
  critical: "bg-critical-dim text-critical border-critical/30",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-ink-faint",
    brand: "bg-brand",
    positive: "bg-positive",
    warning: "bg-warning",
    critical: "bg-critical",
  };

  return <span className={cn("inline-block size-1.5 rounded-full", colors[tone], className)} />;
}
