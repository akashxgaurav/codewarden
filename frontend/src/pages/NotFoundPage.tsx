import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

export function NotFoundPage() {
  return (
    <div className="grid-noise grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="text-center">
        <Logo className="justify-center" />
        <Compass className="mx-auto mt-10 size-10 text-ink-faint" />
        <h1 className="mt-4 text-2xl font-semibold text-ink">This page does not exist</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The link may be outdated, or the page was moved.
        </p>

        <Link to="/dashboard" className="mt-6 inline-block">
          <Button>Back to the dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
