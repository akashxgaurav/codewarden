import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useWorkspace } from "@/context/workspace-context";
import { apiBaseUrl } from "@/lib/env";

export function ActivityPage() {
  const { activeWorkspace } = useWorkspace();

  return (
    <AppShell
      title="Activity"
      description={`Live events from ${apiBaseUrl}${activeWorkspace ? ` for ${activeWorkspace.owner}/${activeWorkspace.repo}` : ""}.`}
    >
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardHeader
            title="Backend event stream"
            description="Analysis steps, GitHub App calls, webhooks and CloudWatch ingestion as they happen."
          />
          <CardBody>
            <ActivityFeed workspaceId={activeWorkspace?.id} limit={200} filterable />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
