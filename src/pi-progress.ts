export interface PiProgressOptions {
  label: string;
  signal: AbortSignal;
  hasUI: boolean;
  isCurrent: () => boolean;
  isTrusted: () => boolean;
  setStatus: (key: string, value?: string) => void;
  read?: () => Promise<string | undefined>;
}

export function startPiProgress(options: PiProgressOptions): () => void {
  let stopped = false;
  let reading = false;
  const started = Date.now();

  const safeEligible = (): boolean => {
    if (stopped || options.signal.aborted) return false;
    try {
      return options.hasUI && options.isCurrent() && options.isTrusted();
    } catch {
      return false;
    }
  };

  const safeStatus = (value?: string): void => {
    try {
      options.setStatus("clanker", value);
    } catch {
      // UI failures are deliberately ignored.
    }
  };

  const elapsed = (): string =>
    `${String(Math.floor((Date.now() - started) / 1000))}s`;
  const publish = (phase?: string): void => {
    if (!safeEligible()) return;
    const suffix = phase ? ` — ${phase}` : "";
    safeStatus(`${options.label} (${elapsed()})${suffix}`);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    options.signal.removeEventListener("abort", stop);
    try {
      if (options.isCurrent()) safeStatus(undefined);
    } catch {
      // A disposed session cannot own UI cleanup.
    }
  };

  const tick = (): void => {
    if (!safeEligible()) {
      stop();
      return;
    }
    publish();
    const read = options.read;
    if (!read || reading) return;
    reading = true;
    Promise.resolve()
      .then(() => (safeEligible() ? read() : undefined))
      .then((phase) => {
        if (typeof phase === "string") publish(phase);
      })
      .catch(() => {
        // Read failures, including their contents, never reach the UI.
      })
      .finally(() => {
        reading = false;
      });
  };

  if (!safeEligible()) return () => undefined;

  const timer = setInterval(tick, 2000);
  options.signal.addEventListener("abort", stop, { once: true });
  publish();

  return stop;
}
