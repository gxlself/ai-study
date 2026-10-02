export const IDLE_PAUSE_MS = 3 * 60_000;

export class InteractionWatch {
  private lastInput: number;
  constructor(private readonly now: () => number = Date.now) { this.lastInput = now(); }
  touch(): void { this.lastInput = this.now(); }
  expired(): boolean { return this.now() - this.lastInput >= IDLE_PAUSE_MS; }
}
