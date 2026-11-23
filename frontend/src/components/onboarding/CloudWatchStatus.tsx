import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CheckCircle2, Cloud, Copy, Loader2, Terminal, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { api } from "@/lib/api/client";
import { copyText } from "@/lib/download";
import { formatRelativeTime } from "@/lib/format";

/**
 * Shows whether the log group of a workspace is really connected.
 *
 * The customer creates the stack in their own AWS account, so the app cannot
 * know whether it worked. The only proof is an event that arrived, so the
 * panel watches for one and hands out the command that writes a test error
 * into the log group.
 */
export function CloudWatchStatus({
  workspaceId,
  ownerUid,
  getIdToken,
  className,
}: {
  workspaceId: string;
  ownerUid: string;
  getIdToken: () => Promise<string | null>;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const status = useQuery({
    queryKey: ["cloudwatch-status", workspaceId],
    queryFn: () => api.getCloudWatchStatus({ workspaceId, ownerUid }, { getIdToken }),
    // The stack takes a moment to come up, so the answer is polled until an
    // event arrived.
    refetchInterval: (query) => (query.state.data?.connected ? false : 10_000),
    retry: false,
  });

  async function handleCopy() {
    const command = status.data?.testCommand;

    if (!command) {
      return;
    }

    const done = await copyText(command);

    setCopied(done);

    if (done) {
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  const connected = status.data?.connected === true;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Cloud className="size-4 text-ink-faint" />
          <div>
            <p className="text-sm text-ink">Connection</p>
            <p className="text-[11px] text-ink-faint">
              {status.isPending
                ? "Checking..."
                : connected
                  ? `The last error arrived ${formatRelativeTime(status.data?.lastEventAt ?? 0)}.`
                  : "No error has arrived yet."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {status.isPending ? (
            <span className="flex items-center gap-1.5 text-ink-faint">
              <Loader2 className="size-3.5 animate-spin" />
              Checking
            </span>
          ) : connected ? (
            <span className="flex items-center gap-1.5 text-positive">
              <CheckCircle2 className="size-3.5" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-warning">
              <XCircle className="size-3.5" />
              Waiting
            </span>
          )}
        </div>
      </div>

      {connected ? null : (
        <>
          <Alert tone="info" title="Check the connection">
            Run this command in your terminal. It writes one error into your log group, the
            subscription filter picks it up and the agent investigates it, exactly like a real
            error.
          </Alert>

          {status.data?.testCommand ? (
            <div className="rounded-lg border border-line bg-surface-2">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  <Terminal className="size-3.5 text-ink-faint" />
                  Test the connection
                </span>

                <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <pre className="overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-muted">
                {status.data.testCommand}
              </pre>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
