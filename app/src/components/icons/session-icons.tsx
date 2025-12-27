import type { Component } from "solid-js";

type IconProps = {
  size?: number;
  strokeWidth?: number;
};

const createIconProps = (props?: IconProps) => ({
  size: props?.size ?? 16,
  strokeWidth: props?.strokeWidth ?? 2,
});

/** Plus glyph used for add actions. */
export const PlusIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps(props);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
};

/** Close/remove glyph. */
export const XIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 14, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
};

/** Stop glyph used for abort actions. */
export const StopIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 14, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect width="14" height="14" x="5" y="5" rx="2" />
    </svg>
  );
};

/** Paper-plane send glyph. */
export const SendIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 14, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
};

/** Server glyph used for ports/system indicators. */
export const ServerIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 12, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
};

/** Clock glyph used for durations. */
export const ClockIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 12, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
};

/** Message glyph for chat counts. */
export const MessageIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 12, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
};

/** Trash glyph for delete actions. */
export const TrashIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 14, strokeWidth: props?.strokeWidth ?? 2, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
};

/** Chat bubble glyph for empty states. */
export const ChatIcon: Component<IconProps> = (props) => {
  const { size, strokeWidth } = createIconProps({ size: 48, strokeWidth: props?.strokeWidth ?? 1, ...props });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
};
