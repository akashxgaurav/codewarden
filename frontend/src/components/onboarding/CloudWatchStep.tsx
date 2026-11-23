import { useState } from "react";
import { Cloud } from "lucide-react";
import { Input, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { AWS_REGIONS, DEFAULT_FILTER_PATTERN } from "@/lib/cloudwatch";
import type { CloudWatchConnection } from "@/types";

export function CloudWatchStep({
  value,
  onChange,
}: {
  value: CloudWatchConnection;
  onChange: (value: CloudWatchConnection) => void;
}) {
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-ink">Connect your CloudWatch logs</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Codewarden reads the errors of a CloudWatch log group and investigates them in your
          repository, without anyone pasting a stack trace.
        </p>
      </div>

      <Select
        label="AWS region"
        value={value.region}
        onChange={(event) => onChange({ ...value, region: event.target.value })}
        hint="The region your log group lives in."
      >
        {AWS_REGIONS.map((region) => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </Select>

      <Input
        label="CloudWatch log group"
        value={value.logGroupName}
        onChange={(event) => onChange({ ...value, logGroupName: event.target.value })}
        placeholder="/aws/lambda/payments-api"
        spellCheck={false}
        autoComplete="off"
        hint="The name of the log group your application writes to. Find it in the CloudFormation console under Log groups."
      />

      <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Cloud className="mt-0.5 size-4 shrink-0 text-ink-faint" />

          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">Which events are forwarded</p>
            <p className="mt-0.5 text-xs text-ink-faint">
              The subscription filter pattern. The default matches the usual error words.
            </p>

            {advanced ? (
              <Input
                className="mt-3"
                value={value.filterPattern}
                onChange={(event) => onChange({ ...value, filterPattern: event.target.value })}
                placeholder={DEFAULT_FILTER_PATTERN}
                spellCheck={false}
                autoComplete="off"
                hint="Leave it empty to forward every event of the log group."
              />
            ) : (
              <p className="mt-2 font-mono text-[11px] text-ink-muted">{value.filterPattern}</p>
            )}

            <button
              type="button"
              onClick={() => setAdvanced((previous) => !previous)}
              className="mt-2 text-xs text-brand underline-offset-2 hover:underline"
            >
              {advanced ? "Use the default pattern" : "Change the pattern"}
            </button>
          </div>
        </div>
      </div>

      <Alert tone="info">
        You will get a CloudFormation template in the next step. Creating the stack in your own
        account is what connects the log group to Codewarden.
      </Alert>
    </div>
  );
}
