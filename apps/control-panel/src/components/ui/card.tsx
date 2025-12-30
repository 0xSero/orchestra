/**
 * Card Component - Container with consistent styling
 */

import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const Card: Component<CardProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div class={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", local.class)} {...others}>
      {local.children}
    </div>
  );
};

export interface CardHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const CardHeader: Component<CardHeaderProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div class={cn("flex flex-col space-y-1.5 p-4", local.class)} {...others}>
      {local.children}
    </div>
  );
};

export interface CardTitleProps extends JSX.HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle: Component<CardTitleProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <h3 class={cn("text-lg font-semibold leading-none tracking-tight", local.class)} {...others}>
      {local.children}
    </h3>
  );
};

export interface CardDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription: Component<CardDescriptionProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <p class={cn("text-sm text-muted-foreground", local.class)} {...others}>
      {local.children}
    </p>
  );
};

export interface CardContentProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const CardContent: Component<CardContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div class={cn("p-4 pt-0", local.class)} {...others}>
      {local.children}
    </div>
  );
};

export interface CardFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const CardFooter: Component<CardFooterProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div class={cn("flex items-center p-4 pt-0", local.class)} {...others}>
      {local.children}
    </div>
  );
};
