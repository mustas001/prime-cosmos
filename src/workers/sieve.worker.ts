import { sieveBits } from './sieveCore';
import type { SieveRequest, SieveResponse } from './protocol';

// The project compiles against the DOM lib, so type the worker global by hand
// rather than pulling in the conflicting WebWorker lib.
interface WorkerScope {
  onmessage: ((event: MessageEvent<SieveRequest>) => void) | null;
  postMessage(message: SieveResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

const PROGRESS_INTERVAL_MS = 50;

scope.onmessage = ({ data: request }) => {
  if (request.type !== 'sieve') return;
  const { id } = request;

  try {
    const start = performance.now();
    let lastProgress = start;

    const { limit, bits, primeCount } = sieveBits(request.limit, {
      segmentBytes: request.segmentBytes,
      onProgress(fraction) {
        const now = performance.now();
        if (now - lastProgress < PROGRESS_INTERVAL_MS) return;
        lastProgress = now;
        scope.postMessage({ type: 'progress', id, fraction });
      },
    });

    scope.postMessage(
      { type: 'result', id, limit, bits, primeCount, elapsedMs: performance.now() - start },
      [bits.buffer],
    );
  } catch (err) {
    scope.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
