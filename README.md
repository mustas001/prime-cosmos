# Prime Cosmos

Prime numbers as a GPU-driven constellation. Every integer from 1 to 10 million is a point
sprite whose position is computed **in the vertex shader** from its index, so morphing between
twelve layouts costs the CPU nothing. A bit-packed segmented sieve running in a Web Worker supplies primality.

## Run locally

Requires Node ≥ 20.19 and a WebGL 2 browser (any current Chrome, Firefox, Safari or Edge).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # sieve, number theory, layout geometry, morph state machine
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve dist/
```

URL parameters: `?count=200000` starts with fewer integers (useful on slow GPUs);
`?intro=0` skips the opening fly-out from "1 … 100" to the whole range.

## Using it

| | |
|---|---|
| **Pan / zoom** | drag (with inertia) · wheel or pinch (zooms toward the cursor) · double-click · `WASD`/arrows · `+`/`−` |
| **Inspect** | hover any integer for a tooltip · click to pin the inspector (factorization, π(n), neighbouring primes, residues, Gaussian / Eisenstein status, families) |
| **Step through primes** | `[` and `]` with something selected |
| **Layouts** | number keys `1`–`9`, or type `1` then `0` / `1` / `2` for 10–12 (a lone `0` also picks 10); `T` / `Shift+T` cycle through all twelve, or use the *Layout* folder. Changing layout mid-morph retargets smoothly. |
| **Toggles** | `C` composites · `L` numerals · `F` frame everything · `Esc` clear selection |

Zoomed in to a few hundred integers each dot shows its own number; zoomed out to millions the
composites thin to a faint haze while primes keep a luminous floor, so the large-scale structure
(Ulam diagonals, sunflower arms, prime spokes) stays visible. The gauge along the bottom shows
how many integers are in view on a log scale from 1 to 10⁷.

### The layouts

| | |
|---|---|
| **Ulam** · **Hex spiral** | square / triangular-lattice spirals from 1 — primes gather on diagonals |
| **Sacks** · **Phyllotaxis** | `r = √n` with `θ = 2π√n` (squares on the axis) · golden-angle sunflower; tune angle and radius exponent (one preset reproduces Ulam's original `r = n, θ = n rad` plot) |
| **Modular clock** | angle = *n* mod *m*, radius = √*n* — only the coprime spokes hold primes |
| **Matrix** · **Serpentine** | rows of *W* integers · the same with every other row reversed, so each integer touches the next and columns become chevrons |
| **Pyramid** · **Cantor diagonals** | row *k* holds *k* integers · zig-zag anti-diagonals of a square grid |
| **Hilbert** · **Peano** · **Z-order** | space-filling curves (2×2, 3×3, and bit-interleaving): integers that are close in value stay close on screen. In Z-order every prime is odd, so alternate columns stay empty |

### What can be highlighted

* **Field** — integer primes, **Gaussian primes** (integer *n* is mapped to the Ulam lattice site
  and tested as a Gaussian integer — note the 8-fold symmetry), or **Eisenstein primes** (same, on
  the hex spiral's triangular lattice).
* **Families** — twin / cousin / sexy primes, safe primes, any quadratic *an² + bn + c* (Euler's
  *n² + n + 41* is the default preset), Mersenne & Fermat numbers (2ᵏ ± 1), perfect squares.
* **Colour by** — last decimal digit, residue mod 4, or mod 6.

## Architecture

```
src/
  main.ts                 boot: sieve → scene → intro
  app/
    App.ts                owns the render loop; wires camera, morph, picking, HUD, controls
    state.ts              AppState, palettes, defaults
  scene/
    Stage.ts              WebGL2 renderer + post chain (bloom → tone-map → grade)
    PrimeCloud.ts         attribute-less point cloud, drawn from gl_VertexID
    MapController.ts      2-D camera: inertia, zoom-to-cursor, pinch, fly-to (double precision)
    MorphTimeline.ts      topology transitions, incl. mid-flight retargeting
    Picker.ts             GPU picking into a 1×1 depth-tested target
    Markers.ts            hover / selection reticles
    textures.ts           prime bitmask → R8UI texture; digit glyph atlas
    uniforms.ts           shared uniform bag; fixed-point angle packing
  shaders/
    chunks/               common · uniforms · topologies · primes (GLSL)
    points.{vert,frag}    main draw pass
    pick.{vert,frag}      picking pass
    marker.{vert,frag}    reticles
    grade.frag            vignette + dither
    index.ts              assembles sources, injecting constants from topology/constants.ts
  topology/
    topologies.ts         double-precision CPU mirror: positions, visible-window, bounds
                          (incl. a generic block-tree window for the space-filling curves)
    constants.ts          layout constants shared with the shaders
  math/                   bitset · PrimeBitset (O(1) π(x)) · factorize · families · fields
  hud/                    Hud (DOM overlay) · inspect (per-integer facts)
  ui/controls.ts          Tweakpane panel
  workers/                bit-packed segmented sieve (see below)
tests/
```

### How it stays fast

* **No per-point CPU work.** There are no vertex attributes. The shader derives the integer from
  `gl_VertexID`, looks primality up in a bit-packed texture, computes the layout, and decides size,
  colour and whether to draw at all.
* **Culling.** The CPU mirror (`topologies.ts`) turns the viewport into an integer window `[lo, hi]`,
  so only that slice is submitted — zoomed in on a spiral that's thousands of integers out of ten
  million. Sub-pixel composites are additionally thinned by a stable per-integer hash (and
  brightened to compensate) *before* the layout maths runs.
* **Energy-conserving light.** A sub-pixel dot is drawn as a small sprite carrying only its area as
  energy, so zooming out never white-washes; primes have a brightness floor so they never vanish.
  Bloom threshold and radius adapt to on-screen dot size.
* **Rendering is on demand** — nothing is drawn while the view is at rest.

### Numerical care

Float32 has 24 bits, and ten million integers need them all. These places would otherwise
visibly break. The fixed-point angle maths and the culling windows have unit tests; the shader
layouts were additionally checked against the CPU mirror by picking integers back off the GPU
(all seven layouts agree out to n = 10 000 000) — that browser-driven check is not part of
`npm test`:

* Ring / row indices (Ulam, hex, pyramid) use exact `int` arithmetic with a repaired integer √.
* Angles (phyllotaxis, Sacks, clock) come from exact turn fractions: the golden angle is held as a
  64-bit fixed-point fraction and multiplied with wrapping `uint` arithmetic; Sacks uses
  `√n − ⌊√n⌋ = (n − s²)/(√n + s)` to avoid cancellation.
* `sin`/`cos` are replaced by a folded Taylor series. GLSL ES allows the builtins an error of 2⁻¹¹,
  which at radius ≈ 1800 misplaces a point by almost a whole lattice step.
* The camera centre is kept in double precision and uploaded as a float-exact `hi` plus a small
  `lo`, so deep zoom stays jitter-free even a million units from the origin.

### Picking

The pick pass runs the draw pass's own layout code into a 1×1 depth-tested target: every integer
whose hit area contains the cursor is collapsed onto that pixel with depth = distance, so the
nearest wins and the RGBA8 pixel is its id (primes win ties). It is therefore correct at every
zoom and in the middle of a morph, with no CPU spatial index.

## The sieve

`bits[n >> 3] >> (n & 7) & 1` is 1 iff `n` is prime, for `0 ≤ n ≤ limit` (bits above `limit` are
zero). The same bytes become the `R8UI` texture, so the vertex shader tests primality with one
`texelFetch`. 10⁷ costs 1.2 MiB and ~30 ms.

Internally the sieve is odd-only with a 16 kB cache-resident segment, then widened to one bit per
integer via a 256-entry lookup table. See [sieveCore.ts](src/workers/sieveCore.ts).
