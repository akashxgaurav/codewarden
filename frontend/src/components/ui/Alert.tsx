import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const TONES: Record<Tone, { wrapper: string; icon: typeof Info }> = {
  info: { wrapper: "border-brand/30 bg-brand-dim/40 text-brand", icon: Info },
  success: { wrapper: "border-positive/30 bg-positive-dim/40 text-positive", icon: CheckCircle2 },
  warning: { wrapper: "border-warning/30 bg-warning-dim/40 text-warning", icon: AlertTriangle },
  error: { wrapper: "border-critical/30 bg-critical-dim/40 text-critical", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { wrapper, icon: Icon } = TONES[tone];

  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3", wrapper, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-sm">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-ink/80 [&_p]:mt-1">{children}</div> : null}
      </div>
    </div>
  );
}
