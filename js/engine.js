/* Chroma Tilt - shared rules engine (used by the game AND the level verifier) */
(function (root) {
  'use strict';
  // directions: 0 up, 1 right, 2 down, 3 left
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  function parse(level) {
    const N = level.w * level.h;
    const g = {
      w: level.w, h: level.h,
      wall: new Uint8Array(N),
      hole: new Int8Array(N).fill(-1),   // colour of hole, -1 = none
      arrow: new Int8Array(N).fill(-1),  // direction of conveyor, -1 = none
      gate: new Uint8Array(N),           // toggling gate
      hasGates: !!(level.gates && level.gates.length)
    };
    (level.walls || []).forEach(i => g.wall[i] = 1);
    (level.holes || []).forEach(h => g.hole[h.i] = h.c);
    (level.arrows || []).forEach(a => g.arrow[a.i] = a.d);
    (level.gates || []).forEach(i => g.gate[i] = 1);
    return g;
  }

  function initial(level) {
    return {
      ms: level.marbles.map(m => ({ p: m.i, c: m.c })),
      go: !!level.gateOpen
    };
  }

  function isSolved(ms) {
    return ms.every(m => m.p < 0);
  }

  // Apply one tilt in direction d. Returns new state (input is not mutated).
  function move(g, state, d) {
    const w = g.w, h = g.h;
    const ms = state.ms.map(m => ({ p: m.p, c: m.c }));
    const order = [];
    for (let k = 0; k < ms.length; k++) if (ms[k].p >= 0) order.push(k);
    const proj = k => {
      const x = ms[k].p % w, y = (ms[k].p / w) | 0;
      return x * DX[d] + y * DY[d];
    };
    // marbles furthest along the tilt roll first
    order.sort((a, b) => proj(b) - proj(a));

    for (const k of order) {
      const mk = ms[k];
      let p = mk.p, dir = d, steps = 0;
      const trail = [p];
      const maxSteps = 4 * w * h; // guards against conveyor loops
      for (;;) {
        if (++steps > maxSteps) break;
        const x = p % w, y = (p / w) | 0;
        const nx = x + DX[dir], ny = y + DY[dir];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        const q = ny * w + nx;
        if (g.wall[q]) break;
        if (g.gate[q] && !state.go) break;
        let blocked = false;
        for (let j = 0; j < ms.length; j++) {
          if (j !== k && ms[j].p === q) { blocked = true; break; }
        }
        if (blocked) break;
        p = q;
        trail.push(q);
        if (g.arrow[p] >= 0) dir = g.arrow[p];   // conveyor turns the marble
        if (g.hole[p] === mk.c) { p = -1; break; } // falls into matching hole
      }
      mk.p = p;
      mk.trail = trail;          // cells visited (for animation)
      mk.fell = p < 0;
    }
    return { ms, go: g.hasGates ? !state.go : state.go };
  }

  function key(state) {
    return state.ms.map(m => m.p).join(',') + (state.go ? '|1' : '|0');
  }

  // Breadth-first search for the shortest solution. Returns null if none found.
  function solve(level, maxStates, fromState) {
    maxStates = maxStates || 300000;
    const g = parse(level);
    const start = fromState || initial(level);
    if (isSolved(start.ms)) return { moves: 0, path: [] };
    const parent = new Map();
    const k0 = key(start);
    parent.set(k0, null);
    let queue = [{ s: start, k: k0 }];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (let d = 0; d < 4; d++) {
        const ns = move(g, cur.s, d);
        const nk = key(ns);
        if (parent.has(nk)) continue;
        parent.set(nk, { pk: cur.k, d });
        if (isSolved(ns.ms)) {
          const path = [];
          let k = nk;
          while (parent.get(k)) { const e = parent.get(k); path.push(e.d); k = e.pk; }
          path.reverse();
          return { moves: path.length, path };
        }
        if (parent.size > maxStates) return null;
        queue.push({ s: ns, k: nk });
      }
    }
    return null;
  }

  const api = { DX, DY, parse, initial, move, isSolved, solve, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChromaEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

