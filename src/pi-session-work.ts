export class PiSessionWork {
  private open = true;
  private active = false;
  private controller: AbortController | undefined;

  async run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!this.open || this.active) {
      return Promise.reject(new Error("Session work unavailable"));
    }

    this.active = true;
    const controller = new AbortController();
    this.controller = controller;

    let result: Promise<T>;
    try {
      result = action(controller.signal);
    } catch (error) {
      this.active = false;
      this.controller = undefined;
      throw error;
    }

    return Promise.resolve(result).finally(() => {
      this.active = false;
      this.controller = undefined;
    });
  }

  stop(): void {
    this.open = false;
    this.controller?.abort();
  }

  start(): void {
    this.open = true;
  }
}
