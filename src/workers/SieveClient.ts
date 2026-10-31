import { PrimeBitset } from '../math/PrimeBitset';
import type { SieveRequest, SieveResponse } from './protocol';

export class SieveCancelledError extends Error {
  constructor() {
    super('Sieve request was cancelled');
    this.name = 'SieveCancelledError';
  }
}

export interface SieveRunOptions {
  onProgress?: (fraction: number) => void;
  segmentBytes?: number;
}

export interface SieveRun {
  primes: PrimeBitset;
  /** Wall time spent inside the worker. */
  elapsedMs: number;
}

interface Pending {
  id: number;
  resolve: (run: SieveRun) => void;
  reject: (reason: unknown) => void;
  onProgress?: (fraction: number) => void;
}

/**
 * Promise wrapper around the sieve worker. One request is in flight at a time:
 * starting a new one cancels the previous one by terminating the worker (the sieve is a
 * tight synchronous loop, so it cannot observe a cancel message), and a fresh worker is
 * spawned lazily for the next request.
 */
export class SieveClient {
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private nextId = 1;

  sieve(limit: number, options: SieveRunOptions = {}): Promise<SieveRun> {
    this.cancel();
    const worker = this.ensureWorker();
    const id = this.nextId++;

    return new Promise<SieveRun>((resolve, reject) => {
      this.pending = { id, resolve, reject, onProgress: options.onProgress };
      const request: SieveRequest = { type: 'sieve', id, limit, segmentBytes: options.segmentBytes };
      worker.postMessage(request);
    });
  }

  /** Rejects the in-flight request (if any) with `SieveCancelledError`. */
  cancel(): void {
    if (!this.pending) return;
    const { reject } = this.pending;
    this.pending = null;
    this.killWorker();
    reject(new SieveCancelledError());
  }

  dispose(): void {
    this.cancel();
    this.killWorker();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL('./sieve.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SieveResponse>) => this.handle(event.data);
    worker.onerror = (event) => this.fail(new Error(event.message || 'Sieve worker crashed'));
    this.worker = worker;
    return worker;
  }

  private handle(message: SieveResponse): void {
    const pending = this.pending;
    if (!pending || pending.id !== message.id) return; // stale reply from a cancelled request

    switch (message.type) {
      case 'progress':
        pending.onProgress?.(message.fraction);
        break;
      case 'result':
        this.pending = null;
        pending.resolve({
          primes: new PrimeBitset(message.limit, message.bits, message.primeCount),
          elapsedMs: message.elapsedMs,
        });
        break;
      case 'error':
        this.pending = null;
        pending.reject(new Error(message.message));
        break;
    }
  }

  private fail(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    this.killWorker();
    pending?.reject(error);
  }

  private killWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
