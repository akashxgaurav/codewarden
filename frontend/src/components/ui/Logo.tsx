import { cn } from "@/lib/cn";

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-8 place-items-center rounded-lg bg-brand/15 ring-1 ring-brand/40">
        <svg viewBox="0 0 24 24" className="size-4 text-brand" fill="none" aria-hidden="true">
          <path
            d="M12 2.5 4.5 6v6c0 4.4 3.1 8.4 7.5 9.5 4.4-1.1 7.5-5.1 7.5-9.5V6L12 2.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m8.8 12.2 2.2 2.3 4.4-4.7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      {showWordmark ? (
        <span className="text-sm font-semibold tracking-tight text-ink">
          Code<span className="text-brand">warden</span>
        </span>
      ) : null}
    </span>
  );
}
