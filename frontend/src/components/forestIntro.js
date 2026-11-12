import { introLayout, G_S } from './introLayout.js';

// The login intro, as a pure timeline (no three.js, no DOM): it can be sought to any moment and simulated in Node.
//
// Character states:
//   forest_intro (the forest alone; the login card waits outside the screen beyond the left edge)
//   → JumpPreparation (a short approach from the left edge, knees bend, torso forward, arms back)
//   → JumpTakeoff (both legs drive, arms swing up, both feet leave the ground) → JumpAirborne (legs tuck, then reach)
//   → RootCatch (her hands close on the banyan root hanging from the tree's branch; it takes her weight) → Hanging
//   → SwingRight (a pendulum on that root; she hands over to the next root, by the card's corner, and swings on)
//   → RootRelease → CharacterExit (she flies out behind the banyan trunk)
//   → CharacterReturn (she leaps back from the trunk) → RootCatchReturn (the same corner root) → SwingCenter
//   → Climb (hand over hand up the root, boots on it) → PullUp (right hand on the card's top edge, left hand on the root,
//     a boot on the root, she pulls up and mantles) → FinalJump (a short jump along the top edge) → Sit
//   → InteractiveSitIdle
// Card / rope states (in parallel): hidden → rope_activate (at 40 % of the screen width the rope she trails from the
// hidden card locks taut) → enter → drag → settle → rope_release → centred.
//
// Every frame describes the ranger as clips to sample (rangerActor.js), procedural tweaks, inverse-kinematics contacts
// and which joint must be where on screen. Distances are CSS px (y down); S is her standing height; g is 9.81 m/s² at
// her scale.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const smoothstep = (a, b, x) => smooth((x - a) / (b - a));
const minJerk = (u) => { const x = clamp(u, 0, 1); return x * x * x * (10 - 15 * x + 6 * x * x); };

/** Clip lengths (s) of the ranger GLB; the scene passes the real ones. */
export const CLIPS = { Idle: 3.2, Walk: 1.0667, Run: 0.7333, JumpStart: 0.45, JumpAir: 0.8, JumpLand: 0.6, RunningJump: 0.9, Fall: 1.9,
  LedgeHang: 2.4, ClimbUpLedge: 2.8, SitDown: 2.0, SitIdle: 1.625, TurnLeft90: 0.95, TurnRight90: 0.95, Wave: 1.6 };
// Her height per second, matched to the Run clip's stride (no foot sliding): Phase 6 Ranger_Run covers 6.15 m/s at its
// 1.99 m size = 5.27 m/s scaled to the 1.71 m layout, on the 1.76 m scale reference. (Previous ranger: 3.2 / 1.76.)
const RUN_SPEED = 5.27 / 1.76;
const HANG_LEAN = 0.252;         // LedgeHang holds the hands 0.22 m ahead of the hips: lean so she hangs plumb
const RIGHT = Math.PI / 2, LEFT = -Math.PI / 2;
// IK pole directions (world, y up): elbows down and back, knees forward — for facing right / left / the viewer.
const POLE = {
  armR: [-0.5, -1, 0], armL: [0.5, -1, 0], legR: [1, 0.25, 0], legL: [-1, 0.25, 0], armFront: [0, -0.35, -1],
};

// ---------------------------------------------------------------- stage

function polyY(pts, x) {
  if (!pts || pts.length < 2) return null;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i += 1) {
    if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return mix(a[1], b[1], (x - a[0]) / Math.max(1e-6, b[0] - a[0])); }
  }
  return pts[pts.length - 1][1];
}

/**
 * view: { W, H, card: {left, top, right, bottom} (resting box), blocked: [rects of text and controls near the card
 * top], inputTop, trunk: [[x, y], ...] (left edge of the painted banyan trunk, top to bottom), branch: [[x, y], ...]
 * (underside of the painted banyan branch, left to right) }.
 */
export function computeStage(view) {
  const lay = introLayout(view);
  const st = { ...lay, card: { ...view.card }, blocked: view.blocked || [], inputTop: view.inputTop ?? view.card.top + 0.3 * lay.ch,
    trunk: view.trunk || null, branch: view.branch || null };
  if (lay.mode === 'none') return st;
  const { S, T, L, R, W, H } = lay;
  st.g = G_S * S;
  // Her seat: seated, her lower legs hang over the glass below the top edge (about 0.31 S wide, 0.27 S deep). Pick the
  // spot whose footprint touches no text, near the corner she climbs up at.
  const half = 0.17 * S, depth = 0.28 * S;
  const lo = L + 0.42 * S, hi = R - 0.5 * S;
  let best = null;
  for (let x = lo; x <= hi; x += 2) {
    let overlap = 0, clear = Infinity;
    for (const b of st.blocked) {
      if (b.bottom < T - 2 || b.top > T + depth + 4) continue;
      const ox = Math.min(x + half + 4, b.right) - Math.max(x - half - 4, b.left);
      if (ox > 0) overlap += ox * (Math.min(T + depth, b.bottom) - Math.max(T, b.top));
      else clear = Math.min(clear, -ox);
    }
    const score = -overlap * 10 + Math.min(clear, 0.3 * S) - 0.05 * Math.abs(x - hi);
    if (!best || score > best.score) best = { x, score };
  }
  st.seat = { x: best ? best.x : mix(L, R, 0.62), y: T };
  // The rope's anchor: the middle of the card's top border (the rope drapes over the border, never across the form).
  st.ring = { x: (L + R) / 2, y: T };
  // The banyan roots hang from the painted branch: their tops are where they grow out of it (and the swing's pivot).
  const branchY = (x) => { const y = polyY(st.branch, x); return y === null ? -0.04 * H : Math.max(-0.04 * H, y); };
  // The climbing root, beside the card's top-right corner.
  const xB = Math.min(R + 0.3 * S, W - 0.07 * S);
  // Where she takes off (after a short approach from the left edge) and the root she jumps for.
  const takeX = Math.max(0.4 * S, 0.55 * W - 2.3 * S);
  const branchLeft = st.branch ? st.branch[0][0] : -Infinity;
  const xA = clamp(takeX + 2.3 * S, Math.max(branchLeft + 0.02 * W, takeX + 1.3 * S), Math.min(0.65 * W, xB - 0.45 * S));
  st.takeX = takeX;
  st.rootA = { x: xA, y: branchY(xA) };
  st.rootB = { x: xB, y: branchY(xB) };
  // Thinner aerial roots around them, from the same branch.
  st.extraRoots = [xA - 0.36 * S, xA + 0.27 * S, xB + 0.22 * S].filter((x) => x > branchLeft && x < W)
    .map((x, i) => ({ x, y: branchY(x), len: [1.15, 0.8, 1.0][i] * S, r: [0.42, 0.34, 0.4][i] }));
  return st;
}

// Left edge of the painted trunk at height y (screen), or Infinity where there is none.
function trunkEdge(st, y) {
  const pts = st.trunk;
  if (!pts || pts.length < 2) return Infinity;
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i += 1) {
    if (y <= pts[i][1]) { const a = pts[i - 1], b = pts[i]; return mix(a[0], b[0], (y - a[1]) / Math.max(1e-6, b[1] - a[1])); }
  }
  return pts[pts.length - 1][0];
}
/** Is a box (her body) out of sight: behind the trunk, or past the right or bottom edge of the screen? */
function hiddenBox(st, x0, x1, y0, y1) {
  if (x0 > st.W || y0 > st.H) return true;
  for (let k = 0; k <= 4; k += 1) { const y = mix(y0, y1, k / 4); if (x0 < Math.min(st.W, trunkEdge(st, y)) + 2) return false; }
  return true;
}

// ---------------------------------------------------------------- motion helpers

/** Ballistic path from p0 to p1 in time Tf under gravity g (y down). */
function ballistic(p0, p1, Tf, g) {
  const vx = (p1[0] - p0[0]) / Tf, vy = (p1[1] - p0[1] - 0.5 * g * Tf * Tf) / Tf;
  return { at: (tau) => [p0[0] + vx * tau, p0[1] + vy * tau + 0.5 * g * tau * tau], v: (tau) => [vx, vy + g * tau], vx, vy };
}
const at = (pivot, r, th) => [pivot[0] + r * Math.sin(th), pivot[1] + r * Math.cos(th)];

// ---------------------------------------------------------------- the plan

// Her proportions (Phase 6 rig scaled to 1.71 m from soles to hat), in units of S (the 1.76 m scale height).
const BODY = { hips: 0.521, arm: 0.252, grip: 0.055, shToHips: 0.214, ankle: 0.074, foot: 0.137 };
/** From the grip (the palms on the root) to her hips, hanging at a natural full stretch. */
const HANG = BODY.arm * 0.965 + BODY.grip + BODY.shToHips;
/** Hands one above the other on the root (matches the root's second pin in stepRoot). */
const HAND_GAP = 0.07;
/** Seated: her left lower leg hangs a little forward, the right a little back (a relaxed, natural sit). */
const SEAT_LEG_L = 0.12, SEAT_LEG_R = -0.1;

function buildPlan(st, clips) {
  const { S, g, T, R, W } = st;
  const side = st.mode === 'side';
  const { dx, dy } = st.offset;
  const ground = st.ground;
  const segs = [], events = [];
  let time = 0;
  void clips;
  const add = (name, dur, fn, phase) => { const s = { name, phase: phase || name, t0: time, t1: time + dur, dur, fn }; segs.push(s); time += dur; return s; };
  const ev = (t, type, data = {}) => events.push({ t, type, ...data });
  const PA = [st.rootA.x, st.rootA.y], PB = [st.rootB.x, st.rootB.y];

  // ---- hanging from a root. grip: where her palms close on it; phi: her body's angle from the vertical (+: hips to the
  // right of her hands — the pendulum's own angle, so she hangs in line with the root). The body is placed below the
  // grip, both hands are put on the root by inverse kinematics (the scene first sets her shoulders one arm's length
  // below the grip, so the contact is exact), fingers closed, shoulders loaded, legs relaxed and trailing the swing.
  // w < 1 blends the hang in (the catch) or out (the release).
  const hangPose = (rootId, grip, gripL, phi, dir, legs, extra = {}) => {
    const dn = [Math.sin(phi), Math.cos(phi)];
    const hips = [grip[0] + dn[0] * HANG * S, grip[1] + dn[1] * HANG * S];
    const wr = BODY.grip * S, gap = HAND_GAP * S, w = extra.w ?? 1;
    const hand = (k) => ({ x: grip[0] + dn[0] * (wr + k * gap), y: grip[1] + dn[1] * (wr + k * gap) });
    const pole = [dir, 0.2, 0.3];   // elbows forward and a little out, as in a chin-up grip
    const spread = 0.8;             // hands a little wider than the shoulders (in depth): the arms clear the hat brim
    return {
      layers: [{ clip: 'Ranger_Idle', t: 1.2 }], yaw: dir > 0 ? RIGHT : LEFT, roll: -phi,
      anchor: { joint: 'Hips', x: hips[0], y: hips[1] }, hips, grip, gripL, rootId,
      hang: { wrist: [grip[0] + dn[0] * wr, grip[1] + dn[1] * wr], phi, w },   // the upper wrist: the lower one is then within reach too
      ik: [{ limb: 'rightArm', ...hand(0), pole, w, spread }, { limb: 'leftArm', ...hand(1), pole, w, spread }],
      tweaks: { hangLegs: w, legSwing: legs, shrug: 0.16 * w, gripL: w, gripR: w, headPitch: -0.12, spine: -0.05 * w, ...(extra.tweaks || {}) },
      phase: extra.phase,
    };
  };

  // ---- act 1: she leaps into the scene from the canopy at the upper left — already airborne as she enters, body
  // stretched out in a forward dive, legs extending; in the air she rights herself and reaches overhead for the
  // hanging root, closes both hands on it and swings to the right. She never touches the ground before the root.
  const yG1 = ground - (side ? 1.35 : 1.2) * S;          // her hands as they close on the root
  const l1 = yG1 - PA[1];
  const catchGrip = [PA[0], yG1];
  const catchHips = [PA[0], yG1 + HANG * S];

  add('forest_intro', 0.6, () => null);
  ev(time, 'ropeStart');
  const tTake = time;
  // Launch from beyond the upper-left corner (her whole body off screen), a little up and out from the canopy edge.
  const startHips = [-0.55 * S, clamp(0.2 * st.H, 0.62 * S, catchHips[1] - 0.8 * S)];   // the arc's top stays below the logo
  const Tf = clamp((catchHips[0] - startHips[0]) / (3.6 * S), 0.8, 1.25);
  const fly = ballistic(startHips, catchHips, Tf, g);
  const takeHips = startHips;
  add('leap', Tf, (u) => {
    const tau = u * Tf, h = fly.at(tau);
    const meet = smoothstep(0.82, 1, u), reach = 0.97 * smoothstep(0.3, 0.8, u) * (1 - meet) + meet;   // reaching, then contact
    // Ranger_Jump: the stretched take-off pose (arms forward) into the airborne pose (knees drawn up) for the first
    // half; then her legs extend below her (Idle legs, toes pointed) while she reaches up for the root.
    const jt = mix(0.8, 1.06, smoothstep(0.05, 0.5, u));
    const tuck = Math.sin(Math.PI * smoothstep(0.08, 0.62, u)) * (side ? 0.3 : 0.22);
    const legsOut = smoothstep(0.42, 0.85, u);
    // Body: pitched forward into the dive at first, rotating upright (in line with the root) for the catch, with a
    // slight lean back just before it (legs a little ahead, as when catching something above while moving forward).
    const dive = 0.42 * (1 - smoothstep(0.15, 0.72, u)) - 0.1 * Math.sin(Math.PI * smoothstep(0.62, 1, u));
    // The hands reach for the root above her head: the point on it one hang-length above her hips, sliding down the
    // root to the catch point as she drops onto it (at the catch it is exactly the grip).
    const gy = clamp(h[1] - HANG * S, PA[1] + 0.12 * S, yG1);
    const a = hangPose('A', [PA[0], gy], l1, 0, 1, 0.35, { w: meet });
    a.grip = catchGrip;
    // Shoulder correction (exact hand contact at the catch) carried along with her body, so it never drags her ahead
    // onto the root: at the catch it is exactly the hang on the root; before it, only the rig's small offset.
    a.hang = { wrist: [h[0], h[1] - HANG * S + BODY.grip * S], phi: 0, w: smoothstep(0.55, 1, u) };
    a.layers = [{ clip: 'Ranger_Jump', t: jt }, { clip: 'Ranger_Idle', t: 1.2, w: legsOut * (1 - meet), mask: 'legs' }, { clip: 'Ranger_Idle', t: 1.2, w: meet }];
    a.anchor = { joint: 'Hips', x: h[0], y: h[1] }; a.hips = h;
    a.roll = dive * (1 - meet);
    a.ik = a.ik.map((c) => ({ ...c, w: reach }));
    a.tweaks = { ...a.tweaks, tuck: tuck * (1 - meet), legSwing: mix(0.08 * legsOut, 0.35, smoothstep(0.8, 1, u)), foot: 0.4 * legsOut * (1 - meet),
      headPitch: mix(0.15, -0.3, smoothstep(0.25, 0.75, u)), spine: mix(0.12, -0.05, smoothstep(0.2, 0.8, u)), hangLegs: meet };
    a.phase = u < 0.35 ? 'JumpIn' : 'JumpAirborne';
    return a;
  }, 'JumpAirborne');
  const tCatch = time;
  ev(tCatch, 'grab', { root: 'A' });

  // ---- the swing on the first root: a pendulum about where it grows out of the branch; it gives a little under her
  // weight at the catch; hands stay closed on it (the root is pinned to them), legs trail and swing through.
  const vC = (catchHips[0] - takeHips[0]) / Tf;
  const riseMax = side ? Math.max(0.1 * S, yG1 - PA[1] - 0.25 * S) : Math.max(0.04 * S, yG1 - st.B - 10);
  const ampA = Math.min(0.9, Math.acos(clamp(1 - (vC * vC) / (2 * g * l1), -1, 1)), Math.acos(clamp(1 - riseMax / l1, -1, 1)));
  const wA = Math.sqrt(g / l1) * (1 - (ampA * ampA) / 16);
  const thA = (tau) => ampA * Math.sin(wA * tau);
  const omA = (tau) => ampA * wA * Math.cos(wA * tau);
  const give = (tau, k = 0.05) => Math.max(0, k * S * Math.exp(-5 * tau) * Math.sin(Math.min(tau * 16, Math.PI * 3)));
  const gripA = (tau) => { const p = at(PA, l1, thA(tau)); return [p[0], p[1] + give(tau)]; };
  const swingPhase = (tau) => (tau < 0.2 ? 'RootCatch' : tau < 0.36 ? 'Hanging' : 'SwingRight');
  const thT = Math.asin(clamp((PB[0] - PA[0]) / l1, -1, 1));
  const transfer = side && PB[0] - PA[0] < l1 * Math.sin(ampA) * 0.97;
  const tauExtA = Math.PI / (2 * wA);
  let tauA = transfer ? Math.asin(thT / ampA) / wA : 0.9 * tauExtA;
  let hideA = null;
  for (let tau = 0.1; tau <= tauA; tau += 0.02) {
    const gp = gripA(tau), th = thA(tau), hx = gp[0] + Math.sin(th) * HANG * S, hy = gp[1] + Math.cos(th) * HANG * S;
    if (hiddenBox(st, hx - 0.2 * S, hx + 0.2 * S, gp[1] - 0.05 * S, hy + 0.52 * S)) { hideA = tau; break; }
  }
  if (hideA !== null) tauA = hideA;
  add('swingA', tauA, (u) => {
    const tau = u * tauA, th = thA(tau), load = Math.exp(-6 * tau);
    // Shoulders take the load at the catch (a deeper shrug, knees draw up a little), then the legs trail and swing.
    return hangPose('A', gripA(tau), l1, th, 1, clamp(th / ampA, -1, 1) * 0.8 + 0.3 * load,
      { phase: swingPhase(tau), tweaks: { shrug: 0.16 + 0.12 * load, tuck: 0.25 * load } });
  }, 'SwingRight');
  let relGrip, relTh, relOm, relR, relId;
  if (transfer && hideA === null) {
    // Hand over: she lets go of the first root and closes on the corner root at the same point of her arc.
    const tT = time;
    const handsT = gripA(tauA);
    const lB1 = handsT[1] - PB[1];
    ev(tT, 'transfer', { from: 'A', to: 'B' });
    const vT = l1 * omA(tauA);
    const vH = vT * Math.cos(thA(tauA));
    const ampB = Math.min(0.75, Math.acos(clamp(1 - (vH * vH) / (2 * g * lB1), -1, 1)));
    const wB = Math.sqrt(g / lB1) * (1 - (ampB * ampB) / 16);
    const thB = (tau) => ampB * Math.sin(wB * tau);
    const gripB = (tau) => { const p = at(PB, lB1, thB(tau)); return [p[0], p[1] + give(tau, 0.03)]; };
    const tauB = Math.asin(0.86) / wB;
    const carry = thA(tauA);
    add('swingB', tauB, (u) => {
      const tau = u * tauB, th = thB(tau), lean = th + carry * Math.exp(-tau / 0.16);
      return hangPose('B', gripB(tau), lB1, lean, 1, clamp(th / ampB, -1, 1) * 0.8 + 0.1 + 0.4 * Math.exp(-tau / 0.16), { phase: 'SwingRight' });
    }, 'SwingRight');
    relGrip = gripB(tauB); relTh = thB(tauB) + carry * Math.exp(-tauB / 0.16); relOm = ampB * wB * Math.cos(wB * tauB); relR = lB1; relId = 'B';
    st.lB1 = lB1;
  } else {
    relGrip = gripA(tauA); relTh = thA(tauA); relOm = omA(tauA); relR = l1; relId = 'A';
  }
  // =================================================================================================== act 2
  // The right-side banyan root (B, beside the card's top-right corner). She gets onto it — a hand-over on wide screens,
  // a short leap from root A beside it, or (where she tows the card from beneath it, on narrow screens) out past the
  // trunk and a leap back in high up — climbs it hand over hand with her boots clamping it, up to where the woody root
  // is stiff below the branch; pumps the swing about her hands; and on the last forward swing drives her hips up, pulls,
  // lets go and turns a compact tucked back somersault onto the card's top edge, absorbs the landing and sits down.
  // The root hangs from barely above the card's top edge, so only from high on it can a release carry her onto the top.
  const POLE_ARM = POLE.armL, POLE_LEG = POLE.legL;
  const sTop = 0.15 * S;                                   // the highest hand-hold, just below the branch
  const rootPt = (s, th) => at(PB, s, th);                 // point s along root B (from the branch), root at angle th
  const nrm = (th) => [Math.cos(th), -Math.sin(th)];      // perpendicular to the root, towards the trunk side
  const lerpYaw = (f) => mix(RIGHT, LEFT, f);              // turning on the root from facing right to facing the card
  const dampedPend = (th0, om0, l, zeta = 0.22) => {
    const w = Math.sqrt(g / l), wd = w * Math.sqrt(1 - zeta * zeta), b = (om0 + zeta * w * th0) / wd;
    return (tau) => Math.exp(-zeta * w * tau) * (th0 * Math.cos(wd * tau) + b * Math.sin(wd * tau));
  };
  const tRelA = time;
  let sU0, onB;   // her upper hand's place on root B when she starts climbing; the pendulum she is on until then
  let hideInterval = null;
  if (transfer && hideA === null) {
    // Already on root B (hand-over during the first swing): it carries on swinging and settles while she turns to face
    // the card, hands closed on it.
    sU0 = relR; onB = dampedPend(relTh, relOm, relR);
  } else if (side) {
    // Let go of root A near the end of its swing and leap across to root B, catching it a little higher.
    ev(tRelA, 'release', { root: relId });
    const relHipsA = [relGrip[0] + Math.sin(relTh) * HANG * S, relGrip[1] + Math.cos(relTh) * HANG * S];
    sU0 = clamp(relGrip[1] - PB[1] - 0.12 * S, sTop + 0.4 * S, relGrip[1] - PB[1]);
    const catchH = [PB[0], PB[1] + sU0 + HANG * S];
    const Tl = clamp(Math.hypot(catchH[0] - relHipsA[0], catchH[1] - relHipsA[1]) / (2.4 * S), 0.32, 0.55);
    const flyB = ballistic(relHipsA, catchH, Tl, g);
    add('leap_to_B', Tl, (u) => {
      const tau = u * Tl, h = flyB.at(tau), hold = 1 - smoothstep(0, 0.25, u), meet = smoothstep(0.7, 1, u);
      const a = hangPose('B', [PB[0], PB[1] + sU0], sU0, 0, 1, 0.3, { w: meet });
      a.layers = [{ clip: 'Ranger_Idle', t: 1.2 }, { clip: 'Ranger_Jump', t: 1.0, w: 0.5 * (1 - meet) }];
      a.anchor = { joint: 'Hips', x: h[0], y: h[1] }; a.hips = h; a.roll = -relTh * hold;
      a.hang = { wrist: [h[0], h[1] - HANG * S + BODY.grip * S], phi: 0, w: meet };
      a.ik = a.ik.map((c) => ({ ...c, w: 0.97 * smoothstep(0.25, 0.8, u) * (1 - meet) + meet }));
      a.tweaks = { ...a.tweaks, tuck: 0.35 * Math.sin(Math.PI * u), headPitch: -0.3 };
      a.phase = 'TravelRight';
      return a;
    }, 'TravelRight');
    ev(time, 'grab', { root: 'B' });
    onB = dampedPend(0, flyB.v(Tl)[0] / (sU0 + 0.5 * S), sU0);   // the leap's momentum swings her on, then back
  } else {
    // Narrow screens: she tows the card from beneath it, so she lets go, flies out past the trunk, climbs it out of
    // sight and leaps back in to catch root B high up (the rope stays clipped to her and follows her behind the trunk).
    ev(tRelA, 'release', { root: relId });
    const relHips = [relGrip[0] + Math.sin(relTh) * HANG * S, relGrip[1] + Math.cos(relTh) * HANG * S];
    const v1 = [relR * relOm * Math.cos(relTh) + 0.45 * S, Math.max(-0.4 * S, -relR * relOm * Math.sin(relTh))];
    const dropAt = (tau) => [relHips[0] + v1[0] * tau, relHips[1] + v1[1] * tau + 0.5 * g * tau * tau];
    let tDrop = 1.4;
    for (let tau = 0.08; tau <= 1.4; tau += 0.02) {
      const h = dropAt(tau);
      if (hiddenBox(st, h[0] - 0.22 * S, h[0] + 0.22 * S, h[1] - 0.62 * S, h[1] + 0.5 * S)) { tDrop = tau; break; }
    }
    add('fly_out', tDrop, (u) => {
      const tau = u * tDrop, h = dropAt(tau), hold = 1 - smoothstep(0, 0.18, tau);
      const a = hangPose(relId, [relGrip[0] + h[0] - relHips[0], relGrip[1] + h[1] - relHips[1]], relR, relTh * hold, 1, 0.2, { w: hold });
      a.layers = [{ clip: 'Ranger_Idle', t: 1.2 }, { clip: 'Ranger_Jump', t: 1.03, w: smoothstep(0, 0.3, tau) }];
      a.anchor = { joint: 'Hips', x: h[0], y: h[1] }; a.hips = h; a.rootId = null; a.grip = null;
      a.tweaks = { ...a.tweaks, tuck: 0.4 * smoothstep(0.1, 0.4, tau) };
      a.phase = tau < 0.18 ? 'RootRelease' : 'TravelRight';
      return a;
    }, 'TravelRight');
    const exitH = dropAt(tDrop);
    sU0 = sTop + 0.04 * S;
    const hipsC2 = [PB[0], PB[1] + sU0 + HANG * S];
    const ys = hipsC2[1] - 0.1 * S;
    const xs = clamp(trunkEdge(st, ys) + 0.38 * S, PB[0] + 1.05 * S, W + 0.45 * S);
    const tHid = 0.65;
    hideInterval = { t0: time, t1: time + tHid, from: [exitH[0] - 0.07 * S, exitH[1] + 0.03 * S], to: [xs - 0.07 * S, ys + 0.03 * S] };
    add('behind_trunk', tHid, (u) => ({ hidden: true, ropeEnd: [mix(hideInterval.from[0], hideInterval.to[0], smooth(u)), mix(hideInterval.from[1], hideInterval.to[1], smooth(u)) - 0.6 * S * Math.sin(Math.PI * u)] }), 'TravelRight');
    const Tf2 = clamp((xs - hipsC2[0]) / (2.6 * S), 0.42, 0.6);
    const fly2 = ballistic([xs, ys], hipsC2, Tf2, g);
    add('return_leap', Tf2, (u) => {
      const tau = u * Tf2, h = fly2.at(tau), meet = smoothstep(0.78, 1, u);
      const a = hangPose('B', [PB[0], PB[1] + sU0], sU0, 0, -1, 0.3, { w: meet });
      a.layers = [{ clip: 'Ranger_Jump', t: 1.0 }, { clip: 'Ranger_Idle', t: 1.2, w: meet }];
      a.anchor = { joint: 'Hips', x: h[0], y: h[1] }; a.hips = h;
      a.ik = a.ik.map((c) => ({ ...c, w: 0.97 * smoothstep(0.1, 0.75, u) * (1 - meet) + meet }));
      a.tweaks = { ...a.tweaks, tuck: 0.55 * Math.sin(Math.PI * u) * (1 - meet) + 0.35 * smoothstep(0.5, 1, u), headPitch: -0.3 };
      a.phase = 'TravelRight';
      return a;
    }, 'TravelRight');
    ev(time, 'grab', { root: 'B' });
  }
  const tCatch2 = time;

  // ---- the rope: locks taut the moment her waist passes 40 % of the screen width and drags the card in from beyond
  // the left edge; the card stops at the centre (a slight settle). The rope stays clipped to her harness from then on:
  // her hip coil pays out and takes in rope, so it hangs with a light sag and only runs straight under load.
  let t40 = tCatch;
  for (let k = 0; k <= 800; k += 1) {
    const tt = tTake + (k / 800) * (time - tTake);
    const s = segs.find((x) => tt >= x.t0 && tt < x.t1);
    const a = s && s.fn(clamp((tt - s.t0) / s.dur, 0, 1), tt);
    if (a && a.hips && a.hips[0] >= 0.4 * W) { t40 = tt; break; }
  }
  const tC = t40 + (side ? 1.25 : 1.1);
  const tSettle = 0.32, tRelease = tC + tSettle;
  const fracOn = clamp((st.L + dx) / dx, 0, 1);
  let tEnter = t40;
  for (let k = 0; k <= 200; k += 1) { const tt = t40 + (k / 200) * (tC - t40); if (minJerk((tt - t40) / (tC - t40)) >= fracOn) { tEnter = tt; break; } }
  ev(t40, 'ropeTaut'); ev(tC, 'cardStop'); ev(tRelease, 'ropeSlack');

  // ---- on root B: it settles under her as she turns to face the card (wide screens), hands closed on it
  let thEnd = 0;
  if (side) {
    const tSet = 0.75;
    add('hang_B', tSet, (u) => {
      const tau = u * tSet, th = onB(tau), f = smoothstep(0.1, 0.9, u);
      const a = hangPose('B', rootPt(sU0, th), sU0, th, 1, clamp(th / 0.6, -1, 1) * 0.6, { phase: 'RootCatchRight', tweaks: { shrug: 0.16 + 0.1 * Math.exp(-5 * tau) } });
      a.yaw = lerpYaw(f);
      a.ik = a.ik.map((c) => ({ ...c, pole: [mix(1, -1, f), 0.2, 0.3] }));
      return a;
    }, 'RootCatchRight');
    thEnd = onB(tSet);
  }

  // ---- climbing root B hand over hand (wide screens): she draws her knees up and clamps the root between her boots,
  // stands up on the clamp while the lower hand lets go and reaches above the upper one (elbows bend as she pulls, the
  // shoulders stay engaged), then the boots slide up and clamp again. Body behind the root, facing the card.
  const HIP_OFF = 0.12 * S;                                // hips behind the root (towards the trunk)
  const FOOT_CLAMP = 0.22 * S;                             // boots clamp the root this far below the hips (knees up)
  let nClimb = 0, STEP = 0.2 * S, climbEnd = null;
  const climbDecay = (tau) => thEnd * Math.exp(-3 * tau);
  if (side) {
    nClimb = clamp(Math.ceil((sU0 - sTop) / (0.21 * S)), 1, 6);
    STEP = (sU0 - sTop) / nClimb;
    const tMove = 0.36, tClamp = 0.3;
    const sH0 = sU0 + 0.42 * S;                            // hips (along the root) when she starts
    const footAt = (s, th) => { const p = rootPt(s, th), n = nrm(th); return [p[0] + 0.02 * S * n[0], p[1] + 0.02 * S * n[1]]; };
    const handAt = (s, th) => { const p = rootPt(s + BODY.grip * S, th), n = nrm(th); return [p[0] - 0.012 * S * n[0], p[1] - 0.012 * S * n[1]]; };
    const hipsAt = (s, th) => { const p = rootPt(s, th), n = nrm(th); return [p[0] + HIP_OFF * n[0], p[1] + HIP_OFF * n[1]]; };
    const climbPose = (o) => ({
      layers: [{ clip: 'Ranger_Idle', t: 1.2 }], yaw: LEFT, roll: -o.th,
      anchor: { joint: 'Hips', x: o.hips[0], y: o.hips[1] }, hips: o.hips, rootId: 'B',
      grip: o.grip, gripL: o.gripL, grip2: o.grip2, footClamp: o.footClamp,
      tweaks: { climbLegs: o.legs, spine: -0.04 + 0.08 * o.pull, headPitch: -0.32, shrug: 0.12 - 0.06 * o.pull, gripR: o.gR, gripL: o.gL, hangLegs: o.hang || 0 },
      ik: [{ limb: 'rightArm', x: o.hR[0], y: o.hR[1], pole: [-1, 0.2, 0.3], w: 1, spread: 0.4 }, { limb: 'leftArm', x: o.hL[0], y: o.hL[1], pole: [-1, 0.2, 0.3], w: 1, spread: 0.4 },
        { limb: 'rightLeg', x: o.fR[0], y: o.fR[1], pole: POLE_LEG, w: o.wf }, { limb: 'leftLeg', x: o.fL[0], y: o.fL[1], pole: POLE_LEG, w: o.wf }],
      phase: 'ClimbRoot',
    });
    // Knees up, boots onto the root (from the hang).
    add('clamp_root', tClamp, (u) => {
      const tau = u * tClamp, th = climbDecay(tau), f = smoothstep(0, 1, u);
      const hang = hangPose('B', rootPt(sU0, th), sU0, th, -1, 0.2);
      const hc = hipsAt(sH0, th);
      const hips = [mix(hang.hips[0], hc[0], f), mix(hang.hips[1], hc[1], f)];
      const fp = footAt(sH0 + FOOT_CLAMP, th);
      const o = { th, hips, hR: handAt(sU0, th), hL: handAt(sU0 + HAND_GAP * S, th), fR: [fp[0], fp[1] + 0.012 * S], fL: [fp[0], fp[1] - 0.012 * S],
        wf: smoothstep(0.3, 1, u), legs: 0.55 * f, pull: 0, hang: 1 - f, gR: 1, gL: 1, grip: rootPt(sU0, th), gripL: sU0, grip2: { p: rootPt(sU0 + HAND_GAP * S, th), r: sU0 + HAND_GAP * S }, footClamp: fp };
      const a = climbPose(o);
      a.hang = { ...hang.hang, w: 1 - f };
      return a;
    }, 'ClimbRoot');
    // The moves: hands leapfrog (the lower one goes above the upper), hips rise with the legs, boots re-clamp.
    let sR = sU0, sL = sU0 + HAND_GAP * S;
    const moves = [];
    for (let k = 0; k < nClimb; k += 1) {
      const leftMoves = sL > sR;                          // the lower hand moves
      const from = leftMoves ? sL : sR, to = Math.min(sR, sL) - STEP;
      moves.push({ leftMoves, from, to, sR, sL, sH: sH0 - k * STEP });
      if (leftMoves) sL = to; else sR = to;
    }
    add('climb_root', nClimb * tMove, (u) => {
      const tt = u * nClimb * tMove, k = Math.min(nClimb - 1, Math.floor(tt / tMove)), f = (tt - k * tMove) / tMove;
      const m = moves[k], tau = tClamp + tt, th = climbDecay(tau);
      const up = smoothstep(0, 0.5, f), reach = smoothstep(0.08, 0.6, f), feetUp = smoothstep(0.55, 0.95, f);
      const sH = m.sH - STEP * up;                          // stand up on the clamp
      const sMove = mix(m.from, m.to, reach);
      const off = 0.06 * S * Math.sin(Math.PI * reach);    // the free hand comes off the root as it passes
      const sRr = m.leftMoves ? m.sR : sMove, sLl = m.leftMoves ? sMove : m.sL;
      const n = nrm(th);
      const hp = (s, moving) => { const p = handAt(s, th); return moving ? [p[0] - off * n[0], p[1] - off * n[1]] : p; };
      const sF = m.sH + FOOT_CLAMP - STEP * feetUp;           // boots slide up once she has stood up
      const fp = footAt(sF, th);
      const wf = 1 - 0.35 * Math.sin(Math.PI * feetUp);
      const hold = m.leftMoves ? m.sR : m.sL;               // the hand that stays closed
      const free = Math.sin(Math.PI * reach);
      const o = { th, hips: hipsAt(sH, th), hR: hp(sRr, !m.leftMoves), hL: hp(sLl, m.leftMoves), fR: [fp[0], fp[1] + 0.012 * S], fL: [fp[0], fp[1] - 0.012 * S], wf,
        legs: 0.55 - 0.35 * up * (1 - feetUp), pull: up, gR: m.leftMoves ? 1 : 1 - free, gL: m.leftMoves ? 1 - free : 1,
        grip: rootPt(Math.min(hold, reach > 0.95 ? sMove : hold), th), gripL: Math.min(hold, reach > 0.95 ? sMove : hold),
        grip2: reach > 0.95 ? { p: rootPt(Math.max(hold, sMove), th), r: Math.max(hold, sMove) } : null, footClamp: fp };
      return climbPose(o);
    }, 'ClimbRoot');
    climbEnd = { sR, sL, sH: sH0 - nClimb * STEP, sF: sH0 - nClimb * STEP + FOOT_CLAMP, th: climbDecay(tClamp + nClimb * tMove), hipsAt, handAt, footAt };
  }

  // ---- pumping the swing about her hands, high on the root: legs whip forward through the bottom, knees bend on the
  // back swing; each swing goes higher. On the last forward swing she pikes and pulls, and lets go on the way up.
  const tuckOn = !side ? 0.35 : 0;                         // narrow screens: knees stay up over the form
  const gripTop = sTop;
  const rEff = 0.46 * S, wP = Math.sqrt(g / rEff);
  // How far forward (towards the card) the swing may go, and whether she draws her knees up at the forward end (a tuck
  // swing): her body must stay clear of the form — its text, and everything from the first field's label down.
  const clearAt = (Af, tuckF) => {
    const phi = -Af, grip = rootPt(gripTop, 0.3 * phi);
    const sag = 0.32 * S;                                   // measured: the hanging body sits this much lower than the bare geometry
    const hips = [grip[0] + Math.sin(phi) * HANG * S, grip[1] + Math.cos(phi) * HANG * S + sag];
    const legPhi = phi - 0.25 - 0.9 * tuckF, legLen = 0.47 * S * (1 - 0.45 * tuckF);
    const feet = [hips[0] + Math.sin(legPhi) * legLen, hips[1] + Math.cos(legPhi) * legLen];
    const knee = [hips[0] + Math.sin(legPhi - 0.4 * tuckF) * 0.24 * S, hips[1] + Math.cos(legPhi - 0.4 * tuckF) * 0.24 * S];
    const m = 0.05 * S;
    for (const p of [hips, knee, feet]) {
      if (p[0] > st.card.left - m && p[0] < st.card.right + m && p[1] > st.inputTop - 0.03 * S) return false;
      for (const b of st.blocked) if (p[0] > b.left - m && p[0] < b.right + m && p[1] > b.top - m && p[1] < b.bottom + m) return false;
    }
    // ...and on the back swing she must not disappear behind the trunk.
    const back = [grip[0] + Math.sin(Af) * HANG * S, grip[1] + Math.cos(Af) * HANG * S];
    return !hiddenBox(st, back[0] - 0.2 * S, back[0] + 0.25 * S, back[1] - 0.6 * S, back[1] + 0.5 * S);
  };
  // Prefer a full swing with straight legs; then a tucked one; on cramped layouts a smaller swing (the kip at the
  // release supplies the height for the somersault either way).
  let Af = 0.3, tuckF = 0.9;
  search: for (const [tf, lo] of [[0, 0.55], [0.5, 0.55], [0.9, 0.55], [0.9, 0.3]]) {
    for (let a = 1.15; a >= lo - 1e-9; a -= 0.05) if (clearAt(a, tf)) { Af = a; tuckF = tf; break search; }
  }
  const relDelta = 0.4;
  const psi0 = side ? 0 : Math.PI;                         // narrow screens arrive moving towards the card
  const wtRel = side ? 3.5 * Math.PI - relDelta : 2.5 * Math.PI - relDelta;
  const tPump = wtRel / wP;
  const A0 = side ? 0.05 : 0.42;
  const ampP = (tau) => mix(A0, Af, Math.pow(clamp(tau / tPump, 0, 1), 0.8));
  const phiP = (tau) => ampP(tau) * Math.sin(wP * tau + psi0);
  const phiDot = (tau, e = 1e-3) => (phiP(tau + e) - phiP(tau - e)) / (2 * e);
  const pumpStart = time;
  add('pump', tPump, (u) => {
    const tau = u * tPump, phi = phiP(tau), A = ampP(tau), sw = clamp(-phi / Math.max(A, 0.05), -1, 1);
    const last = clamp((tau - (tPump - Math.PI / wP)) / (Math.PI / wP), 0, 1);   // the last forward swing: pike and pull
    const kip = smoothstep(0.35, 1, last);
    const grip = rootPt(gripTop, 0.3 * phi);
    const cramped = tuckF >= 0.9 ? 1 : 0;                  // little room beside the form: knees stay tucked, legs never reach forward
    const a = hangPose('B', grip, gripTop, phi, -1, sw * 0.85 * (1 - 0.6 * cramped) + 0.45 * kip * (1 - cramped), { phase: 'SwingMomentum',
      tweaks: { tuck: Math.max(tuckOn, 0.35 * Math.max(0, -sw), tuckF * 1.2 * smoothstep(-0.2, 0.6, sw)) * (1 - kip) + Math.max(0.25, tuckF) * kip,
        spine: -0.05 + 0.15 * kip, shrug: 0.16 - 0.1 * kip, headPitch: -0.2 + 0.25 * kip } });
    // From the climb: the boots let go of the root, the lower hand comes up beside the other and the legs drop into the
    // hang (the first, small swing).
    if (climbEnd) {
      const b = 1 - smoothstep(0, 0.28, tau);
      if (b > 0) {
        const th = climbEnd.th, hc = climbEnd.hipsAt(climbEnd.sH, th);
        a.hips = [mix(a.hips[0], hc[0], b), mix(a.hips[1], hc[1], b)]; a.anchor = { joint: 'Hips', x: a.hips[0], y: a.hips[1] };
        a.hang = { ...a.hang, w: 1 - b };
        a.roll = mix(a.roll, -th, b);
        const hR0 = climbEnd.handAt(climbEnd.sR, th), hL0 = climbEnd.handAt(climbEnd.sL, th);
        a.ik = a.ik.map((c) => { const p0 = c.limb === 'rightArm' ? hR0 : hL0; return { ...c, x: mix(c.x, p0[0], b), y: mix(c.y, p0[1], b) }; });
        const fp = climbEnd.footAt(climbEnd.sF, th);
        a.ik.push({ limb: 'rightLeg', x: fp[0], y: fp[1] + 0.012 * S, pole: POLE_LEG, w: b }, { limb: 'leftLeg', x: fp[0], y: fp[1] - 0.012 * S, pole: POLE_LEG, w: b });
        a.tweaks = { ...a.tweaks, climbLegs: 0.55 * b, hangLegs: (a.tweaks.hangLegs ?? 1) * (1 - b), legSwing: a.tweaks.legSwing * (1 - b) };
      }
    }
    a.phase = last > 0 ? 'KipRelease' : 'SwingMomentum';
    return a;
  }, 'SwingMomentum');

  // ---- the flyaway: a compact tucked back somersault onto the card's top edge
  const phiRel = phiP(tPump), omRel = phiDot(tPump);
  const gripRel = rootPt(gripTop, 0.3 * phiRel);
  const hipsRel = [gripRel[0] + Math.sin(phiRel) * HANG * S, gripRel[1] + Math.cos(phiRel) * HANG * S];
  const seatX = st.seat.x;
  const landX = clamp(seatX + 0.14 * S, st.L + 0.3 * S, R - 0.16 * S);
  // The card's top edge is only about 0.7 of her height below the top of the screen: she lands with her knees already
  // bent, and the arc peaks just above that, so she stays in view through the whole somersault.
  const landHips = [landX + 0.03 * S, T - 0.25 * S];
  const apexY = landHips[1] - 0.025 * S;
  const Tf3 = Math.sqrt((2 * Math.max(0.05 * S, hipsRel[1] - apexY)) / g) + Math.sqrt((2 * (landHips[1] - apexY)) / g);
  const flip = ballistic(hipsRel, landHips, Tf3, g);
  const LEAN = 0.4;                                        // landing leaning forward over her feet (a touch under-rotated)
  const phiLand = -2 * Math.PI + LEAN;
  const footLand = [[landX - 0.04 * S, T - BODY.ankle * S], [landX + 0.08 * S, T - BODY.ankle * S]];
  ev(time, 'release', { root: 'B' });
  add('flip', Tf3, (u) => {
    const tau = u * Tf3;
    // The release: for the first few hundredths her hips still follow the swing's arc, then the free flight.
    const swing = [hipsRel[0] + Math.cos(phiRel) * HANG * S * omRel * tau, hipsRel[1] - Math.sin(phiRel) * HANG * S * omRel * tau];
    const fl = flip.at(tau), bl = smoothstep(0, 0.16, u);
    const h = [mix(swing[0], fl[0], bl), mix(swing[1], fl[1], bl)];
    const rot = phiRel + (phiLand - phiRel) * minJerk(smoothstep(0, 0.92, u));
    // Tuck: continuing from the kip (no drop of the legs at the release), knees to chest, then legs open for the landing.
    const tk = mix(Math.max(0.25, tuckF) / 1.6, 1, smoothstep(0, 0.2, u)) * (1 - 0.6 * smoothstep(0.68, 0.9, u));
    const land = smoothstep(0.82, 1, u);
    // Hands on the shins in the tuck (rotating with her body), then out in front for balance.
    const c = Math.cos(rot), s = Math.sin(rot);
    const body = (fx, fy) => [h[0] + fx * c + fy * s, h[1] - fx * s + fy * c];
    const shin = body(-0.17 * S, -0.03 * S);
    const grab = 0.9 * tk * smoothstep(0, 0.16, u);       // hands leave the root, then take hold of the shins
    const ik = [{ limb: 'rightArm', x: shin[0], y: shin[1], pole: POLE.armFront, w: grab }, { limb: 'leftArm', x: shin[0], y: shin[1] + 0.02 * S, pole: POLE.armFront, w: grab },
      { limb: 'rightLeg', x: footLand[0][0], y: footLand[0][1], pole: POLE_LEG, w: land }, { limb: 'leftLeg', x: footLand[1][0], y: footLand[1][1], pole: POLE_LEG, w: land }];
    return { layers: [{ clip: 'Ranger_Idle', t: 1.2 }], yaw: LEFT, roll: -rot,
      anchor: { joint: 'Hips', x: h[0], y: h[1] }, hips: h, ik,
      tweaks: { tuck: 1.6 * tk, spine: 0.3 * tk, headPitch: 0.3 * tk - 0.12 * (1 - tk), legSwing: 0.35 * land + 0.2 * (1 - tk) * (1 - land), foot: 0.35 * (1 - land),
        gripL: 0.6 * tk, gripR: 0.6 * tk },
      phase: u < 0.12 ? 'Release' : u < 0.8 ? 'Flip' : 'LandingPrep' };
  }, 'Flip');

  // ---- the landing: contact, the knees and hips absorb it (a slight forward lean), a hand touches down for balance
  const squatHips = [landX + 0.06 * S, T - 0.17 * S];
  const crouchHips = [landX + 0.05 * S, T - 0.21 * S];
  const assistHand = [[landX - 0.17 * S, T - 0.03 * S], [landX - 0.1 * S, T - 0.03 * S]];
  const tLand = 0.5;
  const landEnd = crouchHips;
  const leanAt = (u) => LEAN + 0.12 * Math.sin(Math.PI * smoothstep(0, 0.75, u)) - 0.15 * smoothstep(0.6, 1, u);
  add('land', tLand, (u) => {
    const down = smoothstep(0, 0.4, u), up = smoothstep(0.5, 1, u);
    const h = [mix(landHips[0], squatHips[0], down), mix(mix(landHips[1], squatHips[1], down), crouchHips[1], up)];
    const hw = 0.9 * smoothstep(0.15, 0.4, u) * (1 - 0.7 * smoothstep(0.6, 1, u));
    return { layers: [{ clip: 'Ranger_Idle', t: 1.2 }, { clip: 'Ranger_Jump', t: 0.433, w: 0.75 * smoothstep(0, 0.3, u) }], yaw: LEFT, roll: -leanAt(u),
      anchor: { joint: 'Hips', x: h[0], y: h[1] }, hips: h,
      tweaks: { spine: 0.16 * down - 0.08 * up, headPitch: -0.2, gripL: 0, gripR: 0 },
      ik: [{ limb: 'rightLeg', x: footLand[0][0], y: footLand[0][1], pole: POLE_LEG, w: 1 }, { limb: 'leftLeg', x: footLand[1][0], y: footLand[1][1], pole: POLE_LEG, w: 1 },
        { limb: 'rightArm', x: assistHand[0][0], y: assistHand[0][1], pole: POLE_ARM, w: hw }, { limb: 'leftArm', x: assistHand[1][0], y: assistHand[1][1], pole: POLE_ARM, w: 0.5 * hw }],
      phase: 'LandingAbsorb' };
  }, 'LandingAbsorb');
  ev(time - tLand + 0.01, 'dust', { x: landX, y: T, n: 5 });

  // ---- into the seat: she turns to the viewer and lowers herself onto the edge, legs going over it, hands to the edge
  // Palms resting on the edge just beside her thighs (relaxed, not braced wide).
  const seatHands = (x, w) => [{ limb: 'leftArm', x: x + 0.125 * S, y: T - 0.032 * S, pole: POLE.armFront, depth: 'hips', w },
    { limb: 'rightArm', x: x - 0.125 * S, y: T - 0.032 * S, pole: POLE.armFront, depth: 'hips', w }];
  const seatHips = [seatX, T - 0.057 * S];
  const tSitDown = 0.85;
  add('sit_down', tSitDown, (u) => {
    const f = smoothstep(0, 1, u), turn = smoothstep(0.05, 0.7, u), k = smoothstep(0.25, 0.85, u);
    const h = [mix(landEnd[0], seatHips[0], f), mix(landEnd[1], seatHips[1], smoothstep(0.15, 0.9, u))];
    const feetW = 1 - smoothstep(0.25, 0.6, u);
    const sh = seatHands(h[0], 1);
    const ik = [{ limb: 'rightLeg', x: footLand[0][0], y: footLand[0][1], pole: POLE_LEG, w: feetW }, { limb: 'leftLeg', x: footLand[1][0], y: footLand[1][1], pole: POLE_LEG, w: feetW },
      { limb: 'rightArm', x: mix(assistHand[0][0], sh[1].x, k), y: T - 0.032 * S, pole: POLE.armFront, depth: 'hips', w: mix(0.27, 1, k) },
      { limb: 'leftArm', x: mix(assistHand[1][0], sh[0].x, k), y: T - 0.032 * S, pole: POLE.armFront, depth: 'hips', w: mix(0.14, 1, k) }];
    return { layers: [{ clip: 'Ranger_Idle', t: 1.2 }, { clip: 'Ranger_Jump', t: 0.433, w: 1 - smoothstep(0.2, 0.75, u) }, { clip: 'Ranger_Sitting', t: 0.8, w: smoothstep(0.3, 0.9, u) }],
      yaw: LEFT * (1 - turn), roll: -leanAt(1) * (1 - turn), anchor: { joint: 'Hips', x: h[0], y: h[1] }, hips: h, seat: u > 0.85,
      tweaks: { sitLegs: smoothstep(0.35, 1, u), spine: 0.2 * (1 - f), headPitch: 0.1 * (1 - turn), gripL: 0.3 * f, gripR: 0.3 * f }, ik, phase: 'SitDown' };
  }, 'SitDown');
  add('sit', 0.35, (u) => ({ layers: [{ clip: 'Ranger_Sitting', t: 0.8 }], yaw: 0, anchor: { joint: 'Hips', x: seatX, y: seatHips[1] + 0.012 * S * Math.sin(Math.PI * u) },
    hips: seatHips, seat: true, tweaks: { sitLegs: 1, gripL: 0.3, gripR: 0.3, legL: SEAT_LEG_L * smooth(u), legR: SEAT_LEG_R * smooth(u), spine: 0.05 * smooth(u) }, ik: seatHands(seatX, 1), phase: 'Sit' }), 'Sit');
  ev(time, 'seated');

  events.sort((a, b) => a.t - b.t);
  return { segs, events, tIdle: time, tow: { dx0: dx, dy0: dy, t40, tC, tEnter, tSettle, tRelease }, tCatch, tTake, tCatch2, PA, PB, l1,
    rootLenA: l1 + 0.32 * S, rootLenB: Math.max(sU0, st.lB1 || 0) + 0.5 * S, Tf, ampA, transfer, seatHands, nClimb, Af, tuckF, pumpStart, hideInterval };
}

// ---------------------------------------------------------------- flexible roots and rope (Verlet chains)

function makeChain(points, seg) { return { pts: points.map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y })), seg, pins: new Map() }; }
function stepChain(c, dt, g, damping, iters, stiffness, floor = Infinity, wind = 0, collide = null) {
  const pts = c.pts, n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i], pin = c.pins.get(i);
    if (pin) { p.px = p.x; p.py = p.y; p.x = pin.x; p.y = pin.y; continue; }
    const vx = (p.x - p.px) * damping, vy = (p.y - p.py) * damping;
    p.px = p.x; p.py = p.y; p.x += vx + wind * dt * dt * (i / n); p.y += vy + g * dt * dt;
  }
  for (let it = 0; it < iters; it += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = pts[i], b = pts[i + 1], pa = c.pins.has(i), pb = c.pins.has(i + 1);
      if (pa && pb) continue;
      const ddx = b.x - a.x, ddy = b.y - a.y, dd = Math.hypot(ddx, ddy) || 1e-9, diff = (dd - c.seg) / dd;
      if (pa) { b.x -= ddx * diff; b.y -= ddy * diff; } else if (pb) { a.x += ddx * diff; a.y += ddy * diff; } else { a.x += ddx * diff * 0.5; a.y += ddy * diff * 0.5; b.x -= ddx * diff * 0.5; b.y -= ddy * diff * 0.5; }
    }
    if (stiffness > 0) for (let i = 0; i < n - 2; i += 1) {
      const a = pts[i], b = pts[i + 2], pa = c.pins.has(i), pb = c.pins.has(i + 2);
      const ddx = b.x - a.x, ddy = b.y - a.y, dd = Math.hypot(ddx, ddy) || 1e-9, want = 2 * c.seg * 0.992;
      if (dd >= want || (pa && pb)) continue;
      const diff = ((dd - want) / dd) * stiffness;
      if (pa) { b.x -= ddx * diff; b.y -= ddy * diff; } else if (pb) { a.x += ddx * diff; a.y += ddy * diff; } else { a.x += ddx * diff * 0.5; a.y += ddy * diff * 0.5; b.x -= ddx * diff * 0.5; b.y -= ddy * diff * 0.5; }
    }
    if (floor < Infinity) for (let i = 0; i < n; i += 1) {
      const p = pts[i];
      // Lying on the forest floor: it rests there and drags with friction.
      if (p.y > floor && !c.pins.has(i)) { p.y = floor; p.px = p.x - (p.x - p.px) * 0.6; p.py = p.y; }
    }
    if (collide) collide(c);
  }
}
/** Keep the chain's free points out of a box (the card): each one is pushed out through the nearest side and slides. */
function collideBox(c, b, r, h = null) {
  const pts = c.pts;
  // While she is in front of the card the rope comes over its top edge to her, in front of it (nothing to collide with).
  if (h && h[0] > b.L && h[0] < b.R && h[1] > b.T && h[1] < b.B) return;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (c.pins.has(i) || p.x <= b.L - r || p.x >= b.R + r || p.y <= b.T - r || p.y >= b.B + r) continue;
    const dl = p.x - (b.L - r), dr = b.R + r - p.x, dt = p.y - (b.T - r), db = b.B + r - p.y, m = Math.min(dl, dr, dt, db);
    if (m === dt) { p.y = b.T - r; p.py = p.y; } else if (m === dr) { p.x = b.R + r; p.px = p.x; } else if (m === dl) { p.x = b.L - r; p.px = p.x; } else { p.y = b.B + r; p.py = p.y; }
  }
}
/** The rope's path from its anchor on the card's top edge to a point, around the card (over its corners) if needed. */
function wrapPath(a, h, b, r) {
  if (h[1] <= b.T - r) return [a, h];
  if (h[0] > b.L && h[0] < b.R && h[1] < b.B) return [a, h];   // she is in front of the card: straight over the edge to her
  const TR = [b.R + r, b.T - r], TL = [b.L - r, b.T - r], BR = [b.R + r, b.B + r], BL = [b.L - r, b.B + r];
  if (h[0] >= b.R + r) return [a, TR, h];
  if (h[0] <= b.L - r) return [a, TL, h];
  // Below the card: round whichever side is shorter.
  const right = Math.abs(b.R - a[0]) + (b.B - b.T) + Math.abs(b.R - h[0]), left = Math.abs(a[0] - b.L) + (b.B - b.T) + Math.abs(h[0] - b.L);
  return right <= left ? [a, TR, BR, h] : [a, TL, BL, h];
}
const pathLength = (pts) => { let L = 0; for (let i = 1; i < pts.length; i += 1) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
/** Pull a chain towards a polyline (by arc length), weight k. */
function straightenAlong(c, path, k) {
  const total = pathLength(path) || 1, n = c.pts.length;
  let seg = 0, acc = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const want = (i / (n - 1)) * total;
    while (seg < path.length - 2 && acc + Math.hypot(path[seg + 1][0] - path[seg][0], path[seg + 1][1] - path[seg][1]) < want) { acc += Math.hypot(path[seg + 1][0] - path[seg][0], path[seg + 1][1] - path[seg][1]); seg += 1; }
    const a = path[seg], bb = path[seg + 1], L = Math.hypot(bb[0] - a[0], bb[1] - a[1]) || 1, f = clamp((want - acc) / L, 0, 1);
    const p = c.pts[i];
    if (c.pins.has(i)) continue;
    p.x += (a[0] + (bb[0] - a[0]) * f - p.x) * k; p.y += (a[1] + (bb[1] - a[1]) * f - p.y) * k;
  }
}
function straighten(c, i0, i1, k) {
  const a = c.pts[i0], b = c.pts[i1];
  for (let i = i0 + 1; i < i1; i += 1) { const t = (i - i0) / (i1 - i0), p = c.pts[i]; p.x += (a.x + (b.x - a.x) * t - p.x) * k; p.y += (a.y + (b.y - a.y) * t - p.y) * k; }
}
const chainPoints = (c) => c.pts.map((p) => ({ x: p.x, y: p.y }));

// ---------------------------------------------------------------- particles

function seeded(seed) { let v = seed >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; }; }
// Kinds: dust (soft puff), grit (soil crumb), leaf (tumbling leaf), splash (wet soil droplet), streak (motion dust).
const KIND = { dust: 0, grit: 1, leaf: 2, splash: 3, streak: 4 };
function particle(list, o) { if (list.length < 220) list.push({ rot: 0, spin: 0, sway: 0, phase: 0, ...o, max: o.life }); }
function stepParticles(list, dt, S) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    if (p.kind === 'leaf') {
      p.phase += dt * (3 + p.sway);
      p.vx += Math.cos(p.phase) * 0.9 * S * dt; p.vx *= Math.exp(-2.2 * dt);
      p.vy += 0.5 * S * dt; p.vy *= Math.exp(-2.6 * dt);
      p.rot += p.spin * dt + Math.sin(p.phase) * 1.2 * dt;
    } else {
      const drag = p.kind === 'grit' || p.kind === 'splash' ? 1.1 : p.kind === 'streak' ? 6 : 3.4;
      p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
      p.vy += (p.kind === 'grit' || p.kind === 'splash' ? 5 : p.kind === 'streak' ? 0 : -0.04) * S * dt;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

// ---------------------------------------------------------------- the intro

export function createIntro(stageIn, { settled = false, clips = {} } = {}) {
  let st = stageIn, plan = null, t = 0, evIndex = 0, finished = false;
  let roots = null, held = null, rope = null;
  const particles = [];
  let rand = seeded(5);
  let focus = null, pointer = null, pointerT = -10;
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
  let emitAcc = { grit: 0, dust: 0, streak: 0 };
  let cardSkip = null;   // { t, dx, dy }: the card glides home when the intro is skipped
  let reaction = null;   // { kind, t0 }: a small response to the form (submitting, a sign-in error)

  function setup(next) {
    st = next; t = 0; evIndex = 0; finished = false; particles.length = 0; rand = seeded(5);
    emitAcc = { grit: 0, dust: 0, streak: 0 }; cardSkip = null; held = null; rope = null;
    plan = st.mode === 'none' ? null : buildPlan(st, clips);
    roots = plan ? makeRoots() : null;
  }
  function goEnd() {
    if (!plan) { finished = true; return; }
    t = plan.tIdle + 0.01; evIndex = plan.events.length; finished = true; particles.length = 0;
    held = null; roots = makeRoots();
    rope = makeRope(t, idleActor(t), 'slack');   // she is clipped in whether or not the card was towed (skipped intro, reduced motion)
  }

  const segIndex = (time) => {
    const s = plan.segs;
    if (time >= plan.tIdle) return -1;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].t0 <= time) lo = mid; else hi = mid - 1; }
    return lo;
  };
  function actorAt(time) {
    if (!plan) return null;
    const i = segIndex(time);
    if (i < 0) return idleActor(time);
    const s = plan.segs[i];
    return s.fn(clamp((time - s.t0) / s.dur, 0, 1), time);
  }

  // Seated on the top edge, hands on the edge beside her: breathing, small leg swings and foot movements, now and then a
  // posture shift, a glance at the form or out at the forest; her head and eyes follow the pointer a little, look down
  // at the field being typed in (and politely away from a password); a nod and a small raised hand when the form is sent.
  function idleActor(time) {
    const x = st.seat.x, since = time - plan.tIdle;
    const live = settled ? 0 : 1;
    const legAmp = live * smoothstep(0.4, 1.6, since);
    const cycle = (time % 7.3) / 7.3;
    const env = smoothstep(0.05, 0.2, cycle) * (1 - smoothstep(0.55, 0.75, cycle));
    const shiftC = ((time + 4) % 11) / 11;
    const shift = live * smoothstep(0.0, 0.1, shiftC) * (1 - smoothstep(0.18, 0.3, shiftC));
    const breathe = live * Math.sin(time * 1.6);
    // Ranger_Sitting kicks each leg up to horizontal: the body rests on its calmest frame and only a fifth of that leg
    // swing is kept, for a subtle, natural movement of the hanging legs.
    const layers = [{ clip: 'Ranger_Sitting', t: 0.8 }, { clip: 'Ranger_Sitting', t: since * 0.8, loop: true, w: 0.22 * live, mask: 'legs' }];
    let nod = 0, waving = false;
    if (reaction && reaction.kind === 'submit') {
      const k = t - reaction.t0;
      if (k < 1.3) {
        waving = true;
        layers.push({ clip: 'Wave', t: 0.25 + k * 0.6, w: 0.45 * Math.sin(Math.PI * clamp(k / 1.3, 0, 1)), mask: 'rightArm' });
        nod = 0.18 * Math.sin(Math.PI * clamp(k / 0.6, 0, 1));
      }
    }
    const hands = plan.seatHands(x, 1);
    return {
      layers, yaw: 0, anchor: { joint: 'Hips', x, y: st.card.top - 0.057 * st.S }, hips: [x, st.card.top - 0.057 * st.S], seat: true,
      tweaks: { sitLegs: 1, legL: SEAT_LEG_L + legAmp * 0.2 * Math.sin(time * 2.1) * env, legR: SEAT_LEG_R - legAmp * 0.2 * Math.sin(time * 2.1 + 0.9) * env, spine: 0.05,
        foot: live * (0.18 + 0.1 * Math.sin(time * 1.3)), headYaw: live * look.yaw, headPitch: live * (look.pitch + nod), eyeYaw: live * look.yaw, eyePitch: live * look.pitch,
        breathe, shrug: live * 0.03 * (breathe + 1), sway: live * (0.012 * Math.sin(time * 0.6) + 0.006 * Math.sin(time * 1.37 + 1) + 0.03 * shift) },
      ik: waving ? hands.slice(0, 1) : hands,
    };
  }

  // ---- the card's offset: waiting beyond the left edge, dragged in by the rope (a slight settle at the end), or gliding
  // home when the intro is skipped
  function cardOffset(time) {
    if (!plan) return { dx: 0, dy: 0 };
    if (cardSkip) { const k = smooth((time - cardSkip.t) / 0.4); return { dx: cardSkip.dx * (1 - k), dy: cardSkip.dy * (1 - k) }; }
    const tow = plan.tow;
    if (time <= tow.t40) return { dx: tow.dx0, dy: tow.dy0 };
    const dist = Math.hypot(tow.dx0, tow.dy0) || 1;
    const over = Math.min(6, 0.006 * dist) / dist;   // carries a few px past the centre, then settles back
    let f;
    if (time < tow.tC) f = (1 + over) * minJerk((time - tow.t40) / (tow.tC - tow.t40));
    else if (time < tow.tC + tow.tSettle) f = 1 + over * (1 - smooth((time - tow.tC) / tow.tSettle));
    else f = 1;
    return { dx: tow.dx0 * (1 - f), dy: tow.dy0 * (1 - f) };
  }
  const ringAt = (time) => { const o = cardOffset(time); return [st.ring.x + o.dx, st.ring.y + o.dy]; };
  const hasTow = () => plan && (plan.tow.dx0 !== 0 || plan.tow.dy0 !== 0);

  // ---- the banyan roots: hanging from the branch; pinned to her hands (and boots) while she holds them
  function makeRoot(pivot, len, n = 56) {
    const seg = len / (n - 1);
    const pts = Array.from({ length: n }, (_, i) => ({ x: pivot[0] + Math.sin(i * 0.7) * 0.002 * st.S, y: pivot[1] + seg * i }));
    const c = makeChain(pts, seg);
    c.pins.set(0, { x: pivot[0], y: pivot[1] });
    return { chain: c, pivot };
  }
  function makeRoots() {
    return { A: makeRoot(plan.PA, plan.rootLenA), B: makeRoot(plan.PB, plan.rootLenB),
      extras: (st.extraRoots || []).map((e) => ({ ...makeRoot([e.x, e.y], e.len, 24), r: e.r })) };
  }
  function stepRoot(rt, dt, actor) {
    const c = rt.chain;
    for (const k of [...c.pins.keys()]) if (k !== 0) c.pins.delete(k);
    if (actor && actor.grip) {
      const i = clamp(Math.round(actor.gripL / c.seg), 1, c.pts.length - 2);
      c.pins.set(i, { x: actor.grip[0], y: actor.grip[1] });
      if (actor.grip2) {
        const j = clamp(Math.round(actor.grip2.r / c.seg), i + 1, c.pts.length - 1);
        c.pins.set(j, { x: actor.grip2.p[0], y: actor.grip2.p[1] });
      } else {
        // Her second hand, a little lower down the root.
        const j = Math.min(c.pts.length - 1, i + Math.max(1, Math.round((0.07 * st.S) / c.seg)));
        const th = Math.atan2(actor.grip[0] - rt.pivot[0], actor.grip[1] - rt.pivot[1]);
        c.pins.set(j, { x: actor.grip[0] + Math.sin(th) * (j - i) * c.seg, y: actor.grip[1] + Math.cos(th) * (j - i) * c.seg });
      }
      stepChain(c, dt, st.g * 1.6, 0.93, 12, 0.6);
      straighten(c, 0, i, 0.9);
      // The free end below her lower hand lies along her body (between her arms, down her back), as a vine does when
      // someone hangs from it — it does not whip out sideways when she catches it at speed.
      // Climbing, it runs down through the clamp between her boots instead.
      const via = actor.footClamp || actor.hips;
      if (via) {
        let j = i; for (const k of c.pins.keys()) j = Math.max(j, k);
        const pj = c.pts[j], dx = via[0] - pj.x, dy = via[1] - pj.y, d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(d + 0.15 * st.S, 0.6 * st.S);
        for (let k = j + 1; k < c.pts.length; k += 1) {
          const along = (k - j) * c.seg, wgt = 0.3 * clamp(1 - (along - reach) / (0.25 * st.S), 0, 1);
          const p = c.pts[k];
          if (wgt > 0) { const tx = pj.x + (dx / d) * along, ty = pj.y + (dy / d) * along; p.x += (tx - p.x) * wgt; p.y += (ty - p.y) * wgt; }
          // Beyond her, the rest of the root hangs down (a woody aerial root does not curl up as she swings).
          if (wgt < 0.3) { const q = c.pts[k - 1], f = 0.12 * (1 - wgt / 0.3); p.x += (q.x - p.x) * f; p.y += (q.y + c.seg - p.y) * f; }
        }
      }
    } else {
      // Free: a fairly stiff root — it swings back and settles without folding over on itself.
      stepChain(c, dt, st.g, 0.978, 14, 0.6);
      straighten(c, 0, c.pts.length - 1, 0.06);
    }
  }
  function stepRoots(dt, time, actor) {
    const holding = actor && actor.grip && actor.rootId ? actor.rootId : null;
    stepRoot(roots.A, dt, holding === 'A' && held === 'A' ? actor : null);
    stepRoot(roots.B, dt, holding === 'B' && held === 'B' ? actor : null);
    // The thinner roots stir a little in the air.
    roots.extras.forEach((e, i) => stepChain(e.chain, dt, st.g, 0.985, 6, 0.5, Infinity, st.S * 0.9 * Math.sin(time * 0.7 + i * 1.9)));
  }

  // ---- the green rope: from her harness to the carabiner on the (hidden, then moving) card
  const harness = (actor) => {
    if (actor && actor.hidden && actor.ropeEnd) return actor.ropeEnd;   // behind the trunk: the rope follows her there
    if (!actor || !actor.hips || actor.hidden) return null;
    const f = actor.yaw === RIGHT ? 1 : actor.yaw === LEFT ? -1 : 0;
    return [actor.hips[0] + f * 0.07 * st.S, actor.hips[1] + 0.03 * st.S];
  };
  const floorY = () => st.ground - 0.012 * st.S;
  function makeRope(time, actor, mode = 'pay') {
    const a = ringAt(time), h = harness(actor);
    if (!h) return null;
    const n = 44, box = cardBox(time), r = 0.012 * st.S;
    const path = wrapPath(a, h, box, r), d = pathLength(path), len = mode === 'pay' ? d * 1.15 + 0.3 * st.S : d * 1.05 + 0.1 * st.S;
    const pts = Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return { x: mix(a[0], h[0], u), y: Math.min(floorY(), mix(a[1], h[1], u) + Math.sin(Math.PI * u) * 0.4 * st.S) }; });
    const c = makeChain(pts, len / (n - 1));
    const rope0 = { chain: c, n, mode, len, t0: time, hold: h, box, r };
    rope0.collide = (ch) => collideBox(ch, rope0.box, rope0.r, rope0.hold);
    c.pins.set(0, { x: a[0], y: a[1] }); c.pins.set(n - 1, { x: h[0], y: h[1] });
    for (let k = 0; k < 160; k += 1) stepChain(c, 1 / 240, st.g * 0.8, 0.94, 10, 0.4, mode === 'pay' ? floorY() : Infinity, 0, rope0.collide);
    c.pts.forEach((p) => { p.px = p.x; p.py = p.y; });
    return rope0;
  }
  // The rope stays clipped to her harness and to the middle of the card's top border the whole time. Her hip coil pays
  // out and takes in rope: before the tow it trails with plenty of slack; under the tow it runs straight (around the card's
  // corner when she is below its top); afterwards it keeps a light sag. It drapes over the card, never across it.
  function stepRope(dt, time, actor) {
    if (!rope) return;
    const c = rope.chain, n = rope.n;
    const h = harness(actor) || rope.hold;
    if (!h) return;
    rope.hold = h;
    const a = ringAt(time);
    c.pins.set(0, { x: a[0], y: a[1] }); c.pins.set(n - 1, { x: h[0], y: h[1] });
    rope.box = cardBox(time);
    const path = wrapPath(a, h, rope.box, rope.r), d = pathLength(path);
    const slack = rope.mode === 'slack';
    // Slack: a light sag where it hangs free; laid almost straight where it rests along the card's top edge (near her).
    const onTop = h[1] < rope.box.T + 0.12 * st.S;
    const want = rope.mode === 'pay' ? d * 1.12 + 0.25 * st.S : rope.mode === 'taut' ? d * 0.996 : onTop ? d * 1.012 + 0.015 * st.S : d * 1.018 + 0.035 * st.S;
    // Taking in is quick (the coil's spring), paying out a little slower, so it never piles up into loops.
    const rate = rope.mode === 'taut' ? 30 : rope.mode === 'pay' ? 10 : (want < rope.len ? 24 : 12);
    rope.len += (want - rope.len) * Math.min(1, dt * rate);
    if (rope.mode === 'taut') rope.len = Math.min(rope.len, d * 1.002);
    if (slack) rope.len = Math.min(rope.len, d * 1.15 + 0.12 * st.S);
    c.seg = rope.len / (n - 1);
    stepChain(c, dt, st.g * (rope.mode === 'taut' ? 0.15 : slack ? 0.9 : 0.7), slack ? 0.94 : 0.965, 12, slack ? 0.2 : 0.5, rope.mode === 'pay' ? floorY() : Infinity, 0, rope.collide);
    if (rope.mode === 'taut') straightenAlong(c, path, 0.25);
  }

  // A released root keeps only part of its momentum (no whip).
  function damp(rt) { rt.chain.pts.forEach((p) => { p.px = p.x - (p.x - p.px) * 0.35; p.py = p.y - (p.y - p.py) * 0.35; }); }
  function fire(e, actor) {
    switch (e.type) {
      case 'grab': held = e.root; break;
      case 'transfer': held = e.to; if (roots) damp(roots.A); break;
      case 'release': held = null; if (roots) damp(roots[e.root] || roots.B); break;
      case 'ropeStart': if (hasTow()) rope = makeRope(t, actor); break;
      case 'ropeTaut':
        if (rope) {
          let n = 0;
          rope.chain.pts.forEach((p, i) => {
            if (p.y >= floorY() - 1 && p.x > 0 && p.x < st.W && n < 6 && i % 4 === 0) { puff(p.x, st.ground, 1, 0); n += 1; }
            p.py -= 0.012 * st.S * Math.sin((Math.PI * i) / (rope.n - 1));
          });
          rope.mode = 'taut';
        }
        cardBurst('start');
        break;
      case 'cardStop': cardBurst('stop'); break;
      case 'ropeSlack': if (rope) rope.mode = 'slack'; break;
      case 'dust': puff(e.x, e.y, e.n, e.side || 0); break;
      case 'edgeGrab': puff(e.x - 0.04 * st.S, e.y - 0.02 * st.S, 2, 1); break;
      case 'seated': finished = true; break;
      default: break;
    }
  }
  function puff(x, y, n, sideDir) {
    const S = st.S;
    for (let i = 0; i < n; i += 1) {
      const a = sideDir === 0 ? Math.PI + rand() * Math.PI : sideDir < 0 ? Math.PI * (1.0 + rand() * 0.5) : Math.PI * (1.5 + rand() * 0.5);
      const v = (0.12 + rand() * 0.3) * S;
      particle(particles, { kind: 'dust', x: x + (rand() - 0.5) * 0.12 * S, y: y - rand() * 0.01 * S, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, life: 0.6 + rand() * 0.5, size: (0.05 + rand() * 0.05) * S });
      if (i % 2 === 0) particle(particles, { kind: 'grit', x: x + (rand() - 0.5) * 0.1 * S, y, vx: Math.cos(a) * v * 1.4, vy: -(0.2 + rand() * 0.3) * S, life: 0.4 + rand() * 0.3, size: (0.01 + rand() * 0.008) * S });
    }
  }

  // ---- the card dragged through the undergrowth: soil crumbs, dust, a few leaves, wet soil droplets, faint streaks
  function cardBox(time) { const o = cardOffset(time), c = st.card; return { L: c.left + o.dx, R: c.right + o.dx, T: c.top + o.dy, B: Math.min(st.H + 0.02 * st.S, c.bottom + o.dy) }; }
  function cardBurst(kind) {
    if (!hasTow()) return;
    const S = st.S, b = cardBox(t);
    const xMin = Math.max(b.L, 0), xMax = Math.max(xMin + 0.3 * S, b.R);
    for (let i = 0; i < (kind === 'start' ? 6 : 4); i += 1) {
      const a = Math.PI * (1.1 + rand() * 0.5), v = (0.3 + rand() * 0.4) * S;
      particle(particles, { kind: 'splash', x: mix(xMin, xMax, 0.1 + 0.5 * rand()), y: b.B - rand() * 0.03 * S, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + rand() * 0.25, size: (0.016 + rand() * 0.012) * S });
    }
    for (let i = 0; i < (kind === 'start' ? 5 : 3); i += 1) {
      particle(particles, { kind: 'leaf', x: mix(xMin, xMax, rand()), y: b.B - rand() * 0.05 * S,
        vx: (rand() - 0.65) * 0.5 * S, vy: -(0.1 + rand() * 0.25) * S, life: 1.6 + rand() * 0.9, size: (0.06 + rand() * 0.035) * S, rot: rand() * 6.28, spin: (rand() - 0.5) * 5, sway: rand() * 2, phase: rand() * 6.28 });
    }
    for (let i = 0; i < 6; i += 1) particle(particles, { kind: 'dust', x: mix(xMin, xMax, rand()), y: b.B - rand() * 0.04 * S, vx: (rand() - 0.5) * 0.2 * S, vy: -(0.05 + rand() * 0.08) * S, life: 0.9 + rand() * 0.6, size: (0.07 + rand() * 0.06) * S });
  }
  function emitTow(dt, time) {
    if (!hasTow() || cardSkip) return;
    const tow = plan.tow;
    if (time <= tow.t40 || time >= tow.tC + 0.05) return;
    const o0 = cardOffset(time - dt), o1 = cardOffset(time);
    const vx = (o1.dx - o0.dx) / dt, vy = (o1.dy - o0.dy) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return;
    const S = st.S, b = cardBox(time);
    if (b.R < 0) return;
    const rate = Math.min(speed / S, 4);
    emitAcc.grit += rate * 18 * dt; emitAcc.dust += rate * 4 * dt; emitAcc.streak += rate * 3 * dt;
    const xL = Math.max(b.L, -0.05 * S);
    while (emitAcc.grit >= 1) {
      emitAcc.grit -= 1;
      const onLeft = rand() < 0.35 && b.L > 0;
      const x = onLeft ? b.L + rand() * 0.03 * S : mix(xL + 0.04 * S, b.R - 0.1 * S, Math.pow(rand(), 1.6));
      const y = onLeft ? mix(b.T, b.B, 0.45 + 0.55 * rand()) : b.B - rand() * 0.04 * S;
      particle(particles, { kind: 'grit', x, y, vx: -vx * 0.12 + (rand() - 0.5) * 0.25 * S, vy: (0.05 + rand() * 0.25) * S - vy * 0.1, life: 0.5 + rand() * 0.4, size: (0.012 + rand() * 0.011) * S });
    }
    while (emitAcc.dust >= 1) {
      emitAcc.dust -= 1;
      particle(particles, { kind: 'dust', x: mix(xL, xL + 0.5 * (b.R - xL), rand()), y: b.B - rand() * 0.06 * S, vx: -vx * 0.2 + (rand() - 0.5) * 0.1 * S, vy: -vy * 0.2 - (0.04 + rand() * 0.06) * S, life: 0.8 + rand() * 0.6, size: (0.07 + rand() * 0.07) * S });
    }
    while (emitAcc.streak >= 1) {
      emitAcc.streak -= 1;
      if (b.L < 0) continue;
      particle(particles, { kind: 'streak', x: b.L - rand() * 0.05 * S, y: mix(b.T, b.B, 0.2 + 0.7 * rand()), vx: vx * 0.35, vy: vy * 0.35, life: 0.22 + rand() * 0.12, size: (0.12 + rand() * 0.08) * S, rot: Math.atan2(vy, vx) });
    }
  }

  function step(dt) {
    t += dt;
    const actor = plan ? actorAt(t) : null;
    if (plan) {
      while (evIndex < plan.events.length && plan.events[evIndex].t <= t) { fire(plan.events[evIndex], actor); evIndex += 1; }
      if (roots) stepRoots(dt, t, actor);
      stepRope(dt, t, actor);
      emitTow(dt, t);
    }
    stepParticles(particles, dt, st.S);
  }

  function update(frameDt) {
    const dt = Math.min(frameDt, 0.05);
    if (plan && !settled && !finished) { let rem = dt; while (rem > 1e-6) { const s = Math.min(1 / 240, rem); step(s); rem -= s; } }
    else { t += dt; if (roots) stepRoots(dt, t, null); stepParticles(particles, dt, st.S); }
    // Seated: she looks at the field being typed in (away from a password), otherwise towards the pointer while it
    // moves; left alone, now and then a glance down at the form or out at the forest, then back at the viewer.
    let yawT = 0, pitchT = -0.04;
    if (plan && st.seat) {
      const hx = st.seat.x, hy = st.card.top - 0.45 * st.S;
      if (focus === 'identifier') { yawT = 0.05; pitchT = 0.42; }
      else if (focus === 'password') { yawT = -0.55; pitchT = 0.12; }
      else if (pointer && t - pointerT < 4) {
        yawT = clamp((pointer.x - hx) / (0.45 * st.W), -1, 1) * 0.55;
        pitchT = clamp((pointer.y - hy) / (0.6 * st.H), -0.6, 1) * 0.35;
      } else {
        const c = ((t + 2) % 9.5) / 9.5, f = ((t + 6) % 13) / 13;
        pitchT = 0.35 * smoothstep(0.0, 0.08, c) * (1 - smoothstep(0.22, 0.32, c));
        yawT = -0.7 * smoothstep(0.0, 0.07, f) * (1 - smoothstep(0.14, 0.22, f));
      }
      if (reaction) {
        const k = t - reaction.t0;
        if (reaction.kind === 'submit' && k < 1.6) { yawT = 0.1; pitchT = 0.5; }
        else if (reaction.kind === 'error' && k < 1.1) { yawT = 0.22 * Math.sin(k * 15) * (1 - k / 1.1); pitchT = 0.3; }
        else if (k > 1.6) reaction = null;
      }
    }
    const k = 10;
    look.vy += ((yawT - look.yaw) * k * k - 2 * k * look.vy) * dt; look.yaw += look.vy * dt;
    look.vp += ((pitchT - look.pitch) * k * k - 2 * k * look.vp) * dt; look.pitch += look.vp * dt;
  }

  function panelPhase(time) {
    if (!hasTow()) return 'centred';
    const tow = plan.tow;
    if (cardSkip || time >= tow.tRelease) return 'centred';
    if (time < tow.t40) return 'hidden';
    if (time < tow.t40 + 0.25) return 'rope_activate';
    if (time < tow.tEnter) return 'enter';
    if (time < tow.tC) return 'drag';
    return 'settle';
  }
  function phaseAt(time, actor) {
    if (!plan) return 'none';
    const i = segIndex(time);
    if (i < 0) return 'InteractiveSitIdle';
    return (actor && actor.phase) || plan.segs[i].phase;
  }

  function frame() {
    const time = t;
    const a = actorAt(time);
    const actor = a && !a.hidden ? a : null;
    const off = cardOffset(time);
    return {
      t: time, phase: phaseAt(time, a), panel: panelPhase(time), actor, particles, stage: st, done: finished || !plan,
      roots: roots ? [{ id: 'A', pts: chainPoints(roots.A.chain), r: 1 }, { id: 'B', pts: chainPoints(roots.B.chain), r: 0.85 }, ...roots.extras.map((e, i) => ({ id: 'x' + i, pts: chainPoints(e.chain), r: e.r }))] : [],
      card: { dx: off.dx, dy: off.dy, moving: !!plan && (off.dx !== 0 || off.dy !== 0) },
      rope: rope ? { pts: chainPoints(rope.chain), mode: rope.mode, ring: ringAt(time), clipped: true } : null,
    };
  }

  setup(stageIn);
  if (settled) goEnd();

  return {
    update, frame,
    get done() { return finished || !plan; },
    get stage() { return st; },
    get time() { return t; },
    get plan() { return plan; },
    /** The viewer started using the form: end the intro at once (she is seated, the card glides home). */
    skip() {
      if (!plan || finished || settled) return;
      const off = cardOffset(t);
      goEnd();
      if (off.dx || off.dy) cardSkip = { t, dx: off.dx, dy: off.dy };
    },
    /** A card that only changes height keeps everything; a real viewport change re-plans and goes to the end. */
    setStage(next) {
      const resized = next.W !== st.W || next.H !== st.H || next.mode !== st.mode
        || Math.abs(next.card.left - st.card.left) > 1 || Math.abs(next.card.right - st.card.right) > 1 || Math.abs(next.card.top - st.card.top) > 1;
      if (!resized) { st.card = { ...next.card }; st.blocked = next.blocked; return; }
      setup(next);
      goEnd();
    },
    setFocus(kind) { focus = kind; },
    setPointer(p) { pointer = p; if (p) pointerT = t; },
    /** A small response to the form: 'submit' (a nod, a small raised hand) or 'error' (a slight shake of the head). */
    react(kind) { reaction = { kind, t0: t }; },
    seek(time) { while (t < time - 1e-9) update(Math.min(1 / 60, time - t)); },
    KIND,
  };
}
