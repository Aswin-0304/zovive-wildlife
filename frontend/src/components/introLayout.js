// Layout shared by the login page and the intro scene. The page uses it to place the card where the intro begins —
// completely outside the screen, beyond the left edge — before the scene has loaded; the intro (forestIntro.js) uses the
// same numbers, so the card never jumps when the scene takes over. Plain arithmetic, no dependencies.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Gravity in units of her height per second² (9.81 m/s² for a 1.76 m tall ranger). */
export const G_S = 9.81 / 1.76;

/**
 * view: { W, H, card: { left, top, right, bottom } (the card's resting, centred box), inputTop } in CSS px.
 * Returns her height S (px), the mode ('side': wide screens, she jumps and swings across the open forest while the card
 * is still far off to the left; 'top': narrow screens, she jumps and swings low, beneath the card's path; 'none'), the
 * forest floor, and where the card starts (an offset from its resting place that puts it entirely outside the screen).
 */
export function introLayout(view) {
  const { W, H } = view;
  const card = view.card;
  const L = card.left, T = card.top, R = card.right, B = card.bottom;
  const cw = R - L, ch = B - T;
  const gapR = W - R;
  // Her height: seated on the top edge, and in the short jump onto it, she must fit in the space above the card.
  let S = Math.min(0.33 * H, (T - 10) / 0.6, 300);
  let mode = 'side';
  if (gapR < 1.2 * S) {
    mode = 'top';
    // While the card is dragged in she swings beneath it: hanging from the root after her jump (hands about 1.2 S above
    // the floor) she stays below its bottom edge.
    S = Math.min(0.3 * H, (T - 10) / 0.6, (H - 6 - B - 4) / 1.2, 300);
  }
  if (S < 70 || W < 300) mode = 'none';
  const out = { W, H, mode, S, T, L, R, B, cw, ch, offset: { dx: 0, dy: 0 } };
  if (mode === 'none') return out;

  // The card waits beyond the left edge of the screen (shadow included); the rope drags it in. Wide screens: a little
  // low, rising into place; narrow screens: at its final height, sliding in above her.
  const dx = Math.round(-(R + Math.max(0.06 * W, 96)));
  const dy = mode === 'top' ? 0 : Math.round(clamp(0.12 * H, 0, H - T - 40));
  out.offset = { dx, dy };
  // The forest floor her approach and jump start from.
  out.ground = mode === 'top' ? H - 6 : H - Math.max(0.025 * H, 10);
  return out;
}

/** The offset the login page applies before the scene loads (0 when the intro will not run). */
export function introCardOffset(view) {
  const layout = introLayout(view);
  return layout.mode === 'none' ? { dx: 0, dy: 0 } : layout.offset;
}
