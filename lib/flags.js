// UI focus: regs only for now. While SHOW_FISH is false, every "fish" player-type
// affordance is hidden from the UI and the app behaves as reg-only. Nothing is
// deleted — fish blobs stay in storage and the data layer still keys on
// playerType — so flipping this back on fully restores the feature.
//
// To bring fish back: set NEXT_PUBLIC_SHOW_FISH=1 in the environment
// (e.g. add `NEXT_PUBLIC_SHOW_FISH=1` to .env.local) and rebuild/restart.
// Must be NEXT_PUBLIC_* so the value reaches client components.
export const SHOW_FISH = process.env.NEXT_PUBLIC_SHOW_FISH === '1';
