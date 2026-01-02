import type { PluginInput } from "@opencode-ai/plugin";

type Platform = "darwin" | "linux" | "win32" | "unsupported";

export type IdleNotificationConfig = {
  enabled?: boolean;
  title?: string;
  message?: string;
  delayMs?: number;
};

function detectPlatform(): Platform {
  const p = process.platform;
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "unsupported";
}

function escapeAppleScriptString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function sendNotification(
  ctx: PluginInput,
  platform: Platform,
  title: string,
  message: string,
): Promise<void> {
  if (platform === "unsupported") return;

  if (platform === "darwin") {
    const t = escapeAppleScriptString(title);
    const m = escapeAppleScriptString(message);
    await ctx.$`osascript -e ${`display notification "${m}" with title "${t}"`}`.catch(
      () => {},
    );
    return;
  }

  if (platform === "linux") {
    await ctx.$`notify-send ${title} ${message} 2>/dev/null`.catch(() => {});
    return;
  }

  // win32
  const psTitle = title.replace(/'/g, "''");
  const psMessage = message.replace(/'/g, "''");
  const toastScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$RawXml = [xml] $Template.GetXml()
($RawXml.toast.visual.binding.text | Where-Object {$_.id -eq '1'}).AppendChild($RawXml.CreateTextNode('${psTitle}')) | Out-Null
($RawXml.toast.visual.binding.text | Where-Object {$_.id -eq '2'}).AppendChild($RawXml.CreateTextNode('${psMessage}')) | Out-Null
$SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
$SerializedXml.LoadXml($RawXml.OuterXml)
$Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)
$Notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode')
$Notifier.Show($Toast)
`
    .trim()
    .replace(/\n/g, "; ");
  await ctx.$`powershell -Command ${toastScript}`.catch(() => {});
}

export function createIdleNotifier(
  ctx: PluginInput,
  config: IdleNotificationConfig,
) {
  const platform = detectPlatform();
  const delayMs = config.delayMs ?? 1500;
  const title = config.title ?? "OpenCode";
  const message = config.message ?? "Session is idle";

  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const notified = new Set<string>();
  const version = new Map<string, number>();

  function bump(sessionID: string) {
    version.set(sessionID, (version.get(sessionID) ?? 0) + 1);
  }

  function cancel(sessionID: string) {
    const t = pending.get(sessionID);
    if (t) clearTimeout(t);
    pending.delete(sessionID);
    bump(sessionID);
    notified.delete(sessionID);
  }

  async function run(sessionID: string, v: number) {
    if (notified.has(sessionID)) return;
    if (version.get(sessionID) !== v) return;
    notified.add(sessionID);
    await sendNotification(ctx, platform, title, message);
  }

  return async ({
    event,
  }: { event: { type: string; properties?: unknown } }) => {
    if (platform === "unsupported") return;
    if (config.enabled !== true) return;

    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.updated" || event.type === "session.created") {
      const info = props?.info as Record<string, unknown> | undefined;
      const sessionID = info?.id as string | undefined;
      if (sessionID) cancel(sessionID);
      return;
    }

    if (event.type !== "session.idle") return;

    const sessionID = props?.sessionID as string | undefined;
    if (!sessionID) return;
    if (pending.has(sessionID)) return;
    if (notified.has(sessionID)) return;

    bump(sessionID);
    const v = version.get(sessionID)!;

    const timer = setTimeout(() => {
      void run(sessionID, v);
      pending.delete(sessionID);
    }, delayMs);
    pending.set(sessionID, timer);
  };
}
