// Tiny cross-tab handoff for "jump to this curve on the Curves tab" links
// (e.g. the balance-curve indicator on the Servos tab). Tabs here are
// separate Svelte roots mounted/unmounted by legacy jQuery tab switching
// (src/js/main.js), not routes, so there's no URL/query param to carry a
// preselection through - this is the one thing they share. Curves.svelte
// consumes and clears it on mount; a stale value left over from a normal
// (non-link) tab visit is simply ignored, since normal navigation never
// sets it.
export const CURVE_NAV = $state({
  pending: null, // { category: string, index: number } | null
});

export function requestCurveView(category, index) {
  CURVE_NAV.pending = { category, index };
  document.querySelector(".tab_curves a")?.click();
}
