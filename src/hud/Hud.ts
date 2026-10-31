import { formatFactors } from '../math/factorize';
import type { IntegerInfo } from './inspect';

const GLASS = 'rounded-xl border border-white/10 bg-zinc-950/60 backdrop-blur-md shadow-2xl shadow-black/50';
const LABEL = 'text-[10px] uppercase tracking-[0.18em] text-zinc-500';

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** 1.2k, 3.4M, … for dense readouts. */
export function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 2 : 1)}k`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 2 : 1)}M`;
  return `${(n / 1e9).toFixed(2)}B`;
}

/** Linear-light RGB (0–1, may exceed 1) → CSS colour for UI swatches. */
export function linearToCss([r, g, b]: readonly [number, number, number]): string {
  const enc = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c)) ** (1 / 2.2));
  return `rgb(${enc(r)} ${enc(g)} ${enc(b)})`;
}

export interface LegendItem {
  label: string;
  color: string;
  ring?: boolean;
}

export interface DensityBucket {
  density: number;
  expected: number;
}

export interface StatsData {
  lo: number;
  hi: number;
  drawn: number;
  count: number;
  integersInView: number;
  pxPerUnit: number;
  primesInWindow: number;
  density: number;
  expected: number;
  fps: number;
  frameMs: number;
  buckets: DensityBucket[];
  fieldLabel: string;
}

export type HudAction = 'fly' | 'prev' | 'next' | 'clear';

const DECADES = 7;

export class Hud {
  onAction: ((action: HudAction) => void) | null = null;

  private readonly el: {
    brandTopo: HTMLElement;
    brandTag: HTMLElement;
    legend: HTMLElement;
    stats: HTMLElement;
    strip: HTMLCanvasElement;
    gaugeMarker: HTMLElement;
    gaugeLabel: HTMLElement;
    hover: HTMLElement;
    inspector: HTMLElement;
    loading: HTMLElement;
    loadingBar: HTMLElement;
    loadingText: HTMLElement;
    fps: HTMLElement;
    help: HTMLElement;
  };

  constructor(root: HTMLElement) {
    const decadeTicks = Array.from({ length: DECADES + 1 }, (_, i) => {
      const left = (i / DECADES) * 100;
      const label = i === 0 ? '1' : i === 1 ? '10' : `10<sup>${i}</sup>`;
      return `<div class="absolute top-0 flex -translate-x-1/2 flex-col items-center" style="left:${left}%">
        <div class="h-1.5 w-px bg-zinc-600"></div>
        <div class="mt-0.5 text-[9px] text-zinc-500">${label}</div></div>`;
    }).join('');

    root.innerHTML = `
      <div class="pointer-events-none absolute inset-0 select-none font-mono text-zinc-300">
        <div class="absolute left-4 top-4 max-w-[19rem] sm:left-5 sm:top-5">
          <div class="text-[11px] font-semibold uppercase tracking-[0.42em] text-zinc-200">Prime<span class="text-red-500"> Cosmos</span></div>
          <div id="hud-topo" class="mt-2 text-[15px] font-medium text-zinc-100"></div>
          <div id="hud-tag" class="mt-0.5 text-[11px] leading-snug text-zinc-500"></div>
          <div id="hud-legend" class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400"></div>
        </div>

        <div id="hud-inspector" class="${GLASS} pointer-events-auto absolute left-4 top-36 hidden w-[17.5rem] p-3 text-[11px] sm:left-5 sm:top-40"></div>

        <div id="hud-stats-card" class="absolute bottom-4 left-4 hidden w-[17.5rem] sm:bottom-5 sm:left-5 sm:block">
          <div class="${GLASS} p-3">
            <div class="flex items-baseline justify-between">
              <div class="${LABEL}">Window</div>
              <div id="hud-fps" class="text-[10px] text-zinc-500"></div>
            </div>
            <div id="hud-stats" class="mt-1.5 space-y-0.5 text-[11px]"></div>
            <canvas id="hud-strip" class="mt-2 h-8 w-full rounded"></canvas>
            <div class="mt-1 flex justify-between text-[9px] text-zinc-600"><span>prime density across the window</span><span><i class="not-italic text-red-400/80">▮</i> actual <i class="not-italic text-zinc-400">┄</i> 1/ln n</span></div>
          </div>
        </div>

        <div class="absolute bottom-4 left-1/2 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 sm:bottom-5">
          <div class="relative h-9">
            <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent"></div>
            ${decadeTicks}
            <div id="hud-gauge-marker" class="absolute -top-[5px] h-[11px] w-[11px] -translate-x-1/2 rounded-full bg-red-500 shadow-[0_0_14px_3px_rgba(239,68,68,0.75)]" style="left:0%"></div>
          </div>
          <div id="hud-gauge-label" class="mt-0.5 text-center text-[11px] text-zinc-400"></div>
        </div>

        <div id="hud-help" class="absolute bottom-5 right-5 hidden text-right text-[10px] leading-relaxed text-zinc-600 lg:block">
          drag · pan &nbsp; wheel · zoom &nbsp; click · pin<br>
          1–12 layouts &nbsp; T next &nbsp; C composites &nbsp; L numerals &nbsp; F frame<br>
          [ ] prev/next prime &nbsp; Esc · clear
        </div>

        <div id="hud-hover" class="${GLASS} pointer-events-none absolute hidden w-60 p-2.5 text-[11px]" style="left:0;top:0"></div>

        <div id="hud-loading" class="pointer-events-auto absolute inset-0 grid place-items-center bg-black transition-opacity duration-700">
          <div class="w-[min(20rem,80vw)] text-center">
            <div class="text-sm font-semibold uppercase tracking-[0.5em] text-zinc-200">Prime<span class="text-red-500"> Cosmos</span></div>
            <div class="mt-5 h-px w-full overflow-hidden bg-zinc-800"><div id="hud-loading-bar" class="h-full w-0 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]"></div></div>
            <div id="hud-loading-text" class="mt-3 text-[11px] text-zinc-500">sieving…</div>
          </div>
        </div>
      </div>`;

    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    this.el = {
      brandTopo: q('hud-topo'),
      brandTag: q('hud-tag'),
      legend: q('hud-legend'),
      stats: q('hud-stats'),
      strip: q<HTMLCanvasElement>('hud-strip'),
      gaugeMarker: q('hud-gauge-marker'),
      gaugeLabel: q('hud-gauge-label'),
      hover: q('hud-hover'),
      inspector: q('hud-inspector'),
      loading: q('hud-loading'),
      loadingBar: q('hud-loading-bar'),
      loadingText: q('hud-loading-text'),
      fps: q('hud-fps'),
      help: q('hud-help'),
    };

    this.el.inspector.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button) this.onAction?.(button.dataset.action as HudAction);
    });
  }

  // ---- loading --------------------------------------------------------------

  setLoading(fraction: number, text: string): void {
    this.el.loadingBar.style.width = `${Math.round(fraction * 100)}%`;
    this.el.loadingText.textContent = text;
  }

  hideLoading(): void {
    this.el.loading.style.opacity = '0';
    this.el.loading.style.pointerEvents = 'none';
    setTimeout(() => this.el.loading.remove(), 800);
  }

  // ---- brand + legend -------------------------------------------------------------

  setBrand(topology: string, tagline: string): void {
    this.el.brandTopo.textContent = topology;
    this.el.brandTag.textContent = tagline;
  }

  setLegend(items: LegendItem[]): void {
    this.el.legend.innerHTML = items
      .map((i) => {
        const dot = i.ring
          ? `<span class="inline-block h-2.5 w-2.5 rounded-full border-2" style="border-color:${i.color};box-shadow:0 0 8px ${i.color}"></span>`
          : `<span class="inline-block h-2 w-2 rounded-full" style="background:${i.color};box-shadow:0 0 8px ${i.color}"></span>`;
        return `<span class="flex items-center gap-1.5">${dot}${i.label}</span>`;
      })
      .join('');
  }

  // ---- stats + gauge ------------------------------------------------------------

  setStats(s: StatsData): void {
    const row = (k: string, v: string, hint = '') =>
      `<div class="flex justify-between gap-3"><span class="text-zinc-500">${k}</span><span class="text-zinc-100">${v}${
        hint ? ` <span class="text-zinc-600">${hint}</span>` : ''
      }</span></div>`;

    this.el.stats.innerHTML = [
      row('n range', `${compact(s.lo)} – ${compact(s.hi)}`),
      row('in view', `≈ ${compact(s.integersInView)}`),
      row(`${s.fieldLabel} in window`, fmt(s.primesInWindow)),
      row('density', `${(s.density * 100).toFixed(2)}%`, `vs ${(s.expected * 100).toFixed(2)}% 1/ln n`),
      row('zoom', `${s.pxPerUnit >= 10 ? s.pxPerUnit.toFixed(0) : s.pxPerUnit.toPrecision(2)} px / integer`),
    ].join('');
    const drawn = `${compact(s.drawn)} pts`;
    this.el.fps.textContent = s.fps > 0 ? `${drawn} · ${Math.round(s.fps)} fps · ${s.frameMs.toFixed(1)} ms` : `${drawn} · idle`;

    const decade = Math.log10(Math.max(1, s.integersInView));
    this.el.gaugeMarker.style.left = `${Math.min(100, Math.max(0, (decade / DECADES) * 100))}%`;
    this.el.gaugeLabel.textContent =
      s.integersInView < 1.5 ? 'a single integer fills the view' : `${compact(s.integersInView)} integers in view`;

    this.drawStrip(s.buckets);
  }

  private drawStrip(buckets: DensityBucket[]): void {
    const canvas = this.el.strip;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (buckets.length === 0) return;

    const peak = Math.max(1e-9, ...buckets.map((b) => Math.max(b.density, b.expected))) * 1.15;
    const bw = w / buckets.length;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h);
    buckets.forEach((b, i) => {
      const bh = (b.density / peak) * h;
      const g = ctx.createLinearGradient(0, h - bh, 0, h);
      g.addColorStop(0, 'rgba(248,113,113,0.95)');
      g.addColorStop(1, 'rgba(220,38,38,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(i * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
    });

    ctx.strokeStyle = 'rgba(212,212,216,0.7)';
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.lineWidth = dpr;
    ctx.beginPath();
    buckets.forEach((b, i) => {
      const y = h - (b.expected / peak) * h;
      if (i === 0) ctx.moveTo(0, y);
      ctx.lineTo((i + 1) * bw, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---- hover tooltip ------------------------------------------------------------

  showHover(info: IntegerInfo | null): void {
    const el = this.el.hover;
    if (!info) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[15px] font-semibold text-zinc-50">${fmt(info.n)}</span>
        ${this.badge(info)}
      </div>
      <div class="mt-1 text-zinc-300">${info.prime ? `<span class="text-zinc-500">prime #</span>${fmt(info.pi)}` : formatFactors(info.factors)}</div>
      <div class="mt-0.5 text-zinc-600">${info.prime ? `next prime ${fmt(info.nextPrime)} · gap ${info.gap}` : `${info.divisors} divisors`}</div>`;
  }

  /** Keep the tooltip beside the cursor (CSS px), flipping at the window edges. */
  moveHover(x: number, y: number): void {
    const el = this.el.hover;
    const pad = 16;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = x + pad + w > window.innerWidth - 8 ? x - pad - w : x + pad;
    const top = Math.min(window.innerHeight - h - 8, Math.max(8, y + pad));
    el.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
  }

  // ---- pinned inspector ----------------------------------------------------------

  showInspector(info: IntegerInfo | null): void {
    const el = this.el.inspector;
    if (!info) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');

    const row = (k: string, v: string) =>
      `<div class="flex justify-between gap-3"><span class="text-zinc-500">${k}</span><span class="text-right text-zinc-200">${v}</span></div>`;
    const lattice = (name: string, l: IntegerInfo['gaussian'], coord: string) =>
      row(name, `${coord} · N=${fmt(l.norm)} · <span class="${l.prime ? 'text-red-400' : 'text-zinc-500'}">${l.prime ? 'prime' : 'composite'}</span>`);

    const [gx, gy] = info.gaussian.coords;
    const [eq, er] = info.eisenstein.coords;
    const signed = (v: number) => (v < 0 ? `− ${-v}` : `+ ${v}`);

    el.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="${LABEL}">Selected</div>
          <div class="mt-0.5 text-lg font-semibold leading-none text-zinc-50">${fmt(info.n)}</div>
        </div>
        <div class="flex items-center gap-2">${this.badge(info)}
          <button data-action="clear" class="rounded px-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200" title="Clear (Esc)">✕</button></div>
      </div>
      <div class="mt-2 break-words text-[12px] text-zinc-100">${info.prime ? 'prime' : `= ${formatFactors(info.factors)}`}</div>
      <div class="mt-2 space-y-0.5 border-t border-white/10 pt-2">
        ${row('π(n)', fmt(info.pi))}
        ${row('divisors · σ(n)', `${fmt(info.divisors)} · ${fmt(info.sigma)}`)}
        ${row('previous prime', info.prevPrime ? fmt(info.prevPrime) : '—')}
        ${row('next prime', info.nextPrime ? fmt(info.nextPrime) : '—')}
        ${row(info.prime ? 'gap to next' : 'surrounding gap', info.gap ? String(info.gap) : '—')}
        ${row('mod 4 · 6 · 10 · 30', `${info.residues.mod4} · ${info.residues.mod6} · ${info.residues.mod10} · ${info.residues.mod30}`)}
      </div>
      <div class="mt-2 space-y-0.5 border-t border-white/10 pt-2">
        ${lattice('Gaussian', info.gaussian, `${gx} ${signed(gy)}i`)}
        ${lattice('Eisenstein', info.eisenstein, `(${eq}, ${er})`)}
      </div>
      ${
        info.families.length
          ? `<div class="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2">${info.families
              .map((f) => `<span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">${f}</span>`)
              .join('')}</div>`
          : ''
      }
      <div class="mt-3 flex gap-1.5">
        <button data-action="prev" class="flex-1 rounded-md border border-white/10 py-1 text-zinc-300 hover:bg-white/10" title="[">◀ prime</button>
        <button data-action="fly" class="flex-1 rounded-md border border-white/10 py-1 text-zinc-300 hover:bg-white/10">↗ fly to</button>
        <button data-action="next" class="flex-1 rounded-md border border-white/10 py-1 text-zinc-300 hover:bg-white/10" title="]">prime ▶</button>
      </div>`;
  }

  private badge(info: IntegerInfo): string {
    if (info.n === 1) return `<span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">unit</span>`;
    return info.prime
      ? `<span class="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">prime</span>`
      : `<span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">composite</span>`;
  }
}
