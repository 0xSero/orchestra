type IsProcessAliveOptions = {
  treatEpermAsAlive?: boolean;
};

export function isProcessAlive(pid: number, options?: IsProcessAliveOptions): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (
      options?.treatEpermAsAlive &&
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "EPERM"
    ) {
      return true;
    }
    return false;
  }
}
