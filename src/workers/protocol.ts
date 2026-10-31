/** Message contract between `SieveClient` (main thread) and `sieve.worker.ts`. */

export interface SieveRequest {
  type: 'sieve';
  /** Echoed back on every response so the client can ignore stale replies. */
  id: number;
  limit: number;
  segmentBytes?: number;
}

export type SieveResponse =
  | { type: 'progress'; id: number; fraction: number }
  | {
      type: 'result';
      id: number;
      limit: number;
      /** Transferred (zero-copy), not cloned. */
      bits: Uint8Array<ArrayBuffer>;
      primeCount: number;
      elapsedMs: number;
    }
  | { type: 'error'; id: number; message: string };
