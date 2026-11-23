import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const HIGHLIGHTS = [
  {
    title: "Root cause, not guesswork",
    body: "The agent reads the repository, finds the code that produced the error and explains it in your language.",
  },
  {
    title: "A branch with a regression test",
    body: "The fix only ships when the new test fails before the change and passes after it.",
  },
  {
    title: "Every workspace, one board",
    body: "Track the errors of every repository you monitor and see whether the trend is going down.",
  },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,32rem)]">
      <section className="grid-noise relative hidden flex-col justify-between border-r border-line bg-surface p-12 lg:flex">
        <Logo />

        <div className="max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-ink">
            Errors in production, turned into pull requests.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Codewarden clones your repository, diagnoses the error against the real code and opens
            a branch with a validated regression test, so your developers only review and merge.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
                <div>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-ink-faint">
          Codewarden &middot; error monitoring for teams that ship on GitHub
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>

          <div className="mt-7">{children}</div>

          <div className="mt-6 text-sm text-ink-muted">{footer}</div>

          <p className="mt-10 text-xs text-ink-faint">
            By continuing you agree to let Codewarden clone the repositories you connect, in order to
            diagnose the reported errors.
          </p>
        </div>
      </section>
    </div>
  );
}

export function AuthFooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}
