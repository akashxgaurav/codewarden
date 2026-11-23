import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, GitBranch, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Field";

export function BranchPicker({
  branches,
  defaultBranch,
  value,
  onChange,
  error,
}: {
  branches: string[];
  defaultBranch: string | null;
  value: string;
  onChange: (branch: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // The list closes when the user clicks somewhere else on the page.
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return branches;
    }

    return branches.filter((branch) => branch.toLowerCase().includes(needle));
  }, [branches, query]);

  const selected = branches.find((branch) => branch === value);

  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-ink-muted">Branch to monitor</span>

      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-lg border bg-surface-2 px-3 text-left text-sm transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-brand/25",
            error ? "border-critical" : "border-line focus:border-brand",
            open && "border-brand",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <GitBranch className="size-4 shrink-0 text-ink-faint" />
            {selected ? (
              <span className="truncate font-mono text-ink">{selected}</span>
            ) : (
              <span className="text-ink-faint">Select a branch</span>
            )}
          </span>

          <ChevronDown
            className={cn("size-4 shrink-0 text-ink-faint transition-transform", open && "rotate-180")}
          />
        </button>

        {open ? (
          <div className="animate-fade-in absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
            <div className="border-b border-line p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter branches"
                  className="h-8 w-full rounded-md border border-line bg-surface-2 pr-2 pl-8 text-xs text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-xs text-ink-faint">No branch matches that filter.</li>
              ) : null}

              {filtered.map((branch) => (
                <li key={branch}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(branch);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-3"
                  >
                    <span className="truncate font-mono text-ink-muted">{branch}</span>

                    <span className="flex shrink-0 items-center gap-2">
                      {branch === defaultBranch ? (
                        <span className="rounded-full bg-brand-dim px-1.5 py-0.5 text-[10px] text-brand">
                          default
                        </span>
                      ) : null}
                      {branch === value ? <Check className="size-3.5 text-brand" /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-critical">{error}</p>
      ) : (
        <p className="text-xs text-ink-faint">
          {branches.length} branch{branches.length === 1 ? "" : "es"} found. The default branch is{" "}
          <span className="font-mono text-ink-muted">{defaultBranch ?? "unknown"}</span>.
        </p>
      )}
    </div>
  );
}

/**
 * Small helper used by the onboarding form to validate the GitHub url before
 * it is sent to the API.
 */
export function RepoUrlField({
  value,
  onChange,
  error,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <Input
      label="GitHub repository"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="https://github.com/owner/repository"
      error={error}
      hint={hint ?? "Public repositories work directly; private repositories need a GitHub App connection."}
      spellCheck={false}
      autoComplete="off"
    />
  );
}
