import type { Component } from "solid-js";
import type { Skill } from "@/types/skill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const SkillPreview: Component<{ skill: Skill }> = (props) => {
  return (
    <div class="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Overview</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-sm text-muted-foreground">
          <div>
            <span class="font-semibold text-foreground">ID:</span> {props.skill.id}
          </div>
          <div>
            <span class="font-semibold text-foreground">Model:</span> {props.skill.frontmatter.model}
          </div>
          <div>
            <span class="font-semibold text-foreground">Description:</span>{" "}
            {props.skill.frontmatter.description}
          </div>
          <div class="flex flex-wrap gap-2">
            <Badge variant="secondary">{props.skill.source.type}</Badge>
            {props.skill.frontmatter.supportsVision && <Badge variant="outline">Vision</Badge>}
            {props.skill.frontmatter.supportsWeb && <Badge variant="outline">Web</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">System Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <pre class="whitespace-pre-wrap text-sm text-muted-foreground">
            {props.skill.systemPrompt || "No system prompt set."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};
