import { useState } from "react";
import { Check, Cloud, Copy, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { copyText, downloadText } from "@/lib/download";
import type { CloudFormationTemplate } from "@/types";

/**
 * Shows the CloudFormation stack that connects a log group to Codewarden.
 *
 * The stack is built by the API, because it carries the ingest key of the
 * workspace. The customer creates it in their own account, either through the
 * console or with the AWS command line.
 */
export function CloudFormationPanel({
  template,
  stackName,
  region,
  fileName,
}: {
  template: CloudFormationTemplate;
  stackName: string;
  region: string;
  fileName: string;
}) {
  const [copied, setCopied] = useState(false);

  const consoleUrl = `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/new`;

  async function handleCopy() {
    const done = await copyText(template.yaml);

    setCopied(done);

    if (done) {
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Create the stack in your AWS account">
        Open the CloudFormation console, create a stack from this template and let it create the
        forwarder. It takes about a minute. The subscription filter starts sending the errors of{" "}
        <span className="font-mono">{template.logGroupName}</span> to Codewarden as soon as the
        stack is ready.
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void handleCopy()} variant="secondary" size="sm">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy the template"}
        </Button>

        <Button
          onClick={() => downloadText(`${fileName}.yaml`, template.yaml, "text/yaml")}
          variant="secondary"
          size="sm"
        >
          <Download className="size-3.5" />
          Download yaml
        </Button>

        <Button
          onClick={() =>
            downloadText(
              `${fileName}.json`,
              JSON.stringify(template.template, null, 2),
              "application/json",
            )
          }
          variant="secondary"
          size="sm"
        >
          <Download className="size-3.5" />
          Download json
        </Button>

        <a href={consoleUrl} target="_blank" rel="noreferrer">
          <Button variant="secondary" size="sm">
            <ExternalLink className="size-3.5" />
            Open the console
          </Button>
        </a>
      </div>

      <div className="rounded-lg border border-line bg-surface-2">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Cloud className="size-3.5 shrink-0 text-ink-faint" />
            <span className="truncate font-mono text-xs text-ink-muted">{stackName}</span>
          </div>

          <span className="shrink-0 text-[11px] text-ink-faint">{region}</span>
        </div>

        <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-muted">
          {template.yaml}
        </pre>
      </div>

      <details className="rounded-lg border border-line bg-surface-2 px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-ink-muted">
          Create it with the AWS command line
        </summary>

        <pre className="mt-3 overflow-auto font-mono text-[11px] leading-relaxed text-ink-muted">
          {[
            `aws cloudformation deploy \\`,
            `  --template-file ${fileName}.yaml \\`,
            `  --stack-name ${stackName} \\`,
            `  --region ${region} \\`,
            `  --capabilities CAPABILITY_IAM \\`,
            `  --parameter-overrides LogGroupName=${template.logGroupName}`,
          ].join("\n")}
        </pre>

        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-faint">
          <Loader2 className="mt-0.5 size-3 shrink-0" />
          The stack creates a Lambda function, a role for it and the subscription filter. The role
          only reads the log group you named.
        </p>
      </details>
    </div>
  );
}
