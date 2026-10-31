import './style.css';
import { App } from './app/App';
import type { AppState } from './app/state';
import { Hud } from './hud/Hud';
import { MAX_COUNT } from './topology/constants';
import { SieveClient } from './workers/SieveClient';

const host = document.querySelector<HTMLDivElement>('#app')!;
const hudRoot = document.querySelector<HTMLDivElement>('#hud')!;
const panelHost = document.querySelector<HTMLDivElement>('#panel')!;

const hud = new Hud(hudRoot);

// ?count=200000 starts with fewer integers (handy on slow GPUs); ?intro=0 skips the opening fly-out.
const query = new URLSearchParams(location.search);
const initialCount = Number(query.get('count'));
const initial: Partial<AppState> =
  Number.isFinite(initialCount) && initialCount >= 100 ? { count: Math.min(MAX_COUNT, Math.round(initialCount)) } : {};
const playIntro = query.get('intro') !== '0';

function fail(title: string, detail: string): void {
  hud.setLoading(1, `${title} — ${detail}`);
}

async function boot(): Promise<void> {
  // 1. Sieve every prime up to the largest drawable integer, off the main thread.
  const sieve = new SieveClient();
  const { primes, elapsedMs } = await sieve.sieve(MAX_COUNT, {
    onProgress: (f) => hud.setLoading(f * 0.7, 'sieving primes…'),
  });
  sieve.dispose();
  hud.setLoading(0.8, `${primes.primeCount.toLocaleString('en-US')} primes in ${elapsedMs.toFixed(0)} ms · building scene…`);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // 2. Scene, camera, HUD and controls.
  const app = new App(host, panelHost, hud, primes, initial);
  hud.setLoading(1, 'ready');
  app.start(playIntro);
  hud.hideLoading();

  if (import.meta.env.DEV) (window as unknown as { __prime: App }).__prime = app;
}

boot().catch((err: unknown) => {
  console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  fail('Could not start', /webgl/i.test(message) ? 'this browser needs WebGL 2' : message);
});
