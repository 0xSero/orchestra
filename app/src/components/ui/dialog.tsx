/**
 * Dialog Component - Kobalte-based modal dialog
 */

import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

// Dialog Root
export const Dialog = KobalteDialog;

// Dialog Trigger
export const DialogTrigger = KobalteDialog.Trigger;

// Dialog Portal
export const DialogPortal = KobalteDialog.Portal;

// Dialog Close
export const DialogClose = KobalteDialog.CloseButton;

// Dialog Overlay
interface DialogOverlayProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const DialogOverlay: Component<DialogOverlayProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);

  return (
    <KobalteDialog.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
        "data-[expanded]:animate-in data-[closed]:animate-out",
        "data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
        local.class,
      )}
      {...others}
    />
  );
};

// Dialog Content
interface DialogContentProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const DialogContent: Component<DialogContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <KobalteDialog.Portal>
      <DialogOverlay />
      <KobalteDialog.Content
        class={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-6 shadow-lg duration-200",
          "data-[expanded]:animate-in data-[closed]:animate-out",
          "data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
          "data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
          "data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%]",
          "data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%]",
          "rounded-lg",
          local.class,
        )}
        {...others}
      >
        {local.children}
      </KobalteDialog.Content>
    </KobalteDialog.Portal>
  );
};

// Dialog Header
interface DialogHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const DialogHeader: Component<DialogHeaderProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);

  return <div class={cn("flex flex-col space-y-1.5 text-center sm:text-left", local.class)} {...others} />;
};

// Dialog Footer
interface DialogFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const DialogFooter: Component<DialogFooterProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);

  return <div class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", local.class)} {...others} />;
};

// Dialog Title
interface DialogTitleProps extends JSX.HTMLAttributes<HTMLHeadingElement> {}

export const DialogTitle: Component<DialogTitleProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);

  return (
    <KobalteDialog.Title class={cn("text-lg font-semibold leading-none tracking-tight", local.class)} {...others} />
  );
};

// Dialog Description
interface DialogDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {}

export const DialogDescription: Component<DialogDescriptionProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);

  return <KobalteDialog.Description class={cn("text-sm text-muted-foreground", local.class)} {...others} />;
};
