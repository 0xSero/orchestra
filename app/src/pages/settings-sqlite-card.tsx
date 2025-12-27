import { type Component, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DbUser } from "@/types/db";

interface SettingsSqliteCardProps {
  dbPath: string;
  user: DbUser | null;
  onMarkOnboarded: () => Promise<void>;
}

/** Card showing SQLite status and onboarding state. */
export const SettingsSqliteCard: Component<SettingsSqliteCardProps> = (props) => (
  <Card>
    <CardHeader>
      <CardTitle>SQLite Status</CardTitle>
      <CardDescription>Local user data stored per project.</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <div class="text-xs text-muted-foreground mb-1">Database Path</div>
          <div class="text-sm font-mono text-foreground break-all">{props.dbPath || "Not initialized"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground mb-1">User</div>
          <div class="text-sm text-foreground">{props.user?.id ?? "Unknown"}</div>
          <div class="text-xs text-muted-foreground mt-1">Onboarded: {props.user?.onboarded ? "yes" : "no"}</div>
          <Show when={!props.user?.onboarded}>
            <Button size="sm" class="mt-2" onClick={() => void props.onMarkOnboarded()}>
              Mark Onboarded
            </Button>
          </Show>
        </div>
      </div>
    </CardContent>
  </Card>
);
