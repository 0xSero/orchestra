import type { Component } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentProfile } from "@/types/agent";

export const AgentPreview: Component<{ agent: AgentProfile }> = (props) => {
  return (
    <div class="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Overview</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-sm text-muted-foreground">
          <div>
            <span class="font-semibold text-foreground">ID:</span> {props.agent.id}
          </div>
          <div>
            <span class="font-semibold text-foreground">Model:</span> {props.agent.frontmatter.model}
          </div>
          <div>
            <span class="font-semibold text-foreground">Description:</span> {props.agent.frontmatter.description}
          </div>
          <div class="flex flex-wrap gap-2">
            <Badge variant="secondary">{props.agent.source.type}</Badge>
            {props.agent.frontmatter.supportsVision && <Badge variant="outline">Vision</Badge>}
            {props.agent.frontmatter.supportsWeb && <Badge variant="outline">Web</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">System Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <pre class="whitespace-pre-wrap text-sm text-muted-foreground">
            {props.agent.systemPrompt || "No system prompt set."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};
