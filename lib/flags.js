// Player-type toggle (REG / FISH). On by default: the spot tabs, coverage modal
// and deep links can all be switched between vs-regs and vs-fish data. The data
// layer keys every blob on playerType, so the toggle just changes the key.
//
// To hide fish again (reg-only UI): set NEXT_PUBLIC_SHOW_FISH=0 in the
// environment (e.g. add `NEXT_PUBLIC_SHOW_FISH=0` to .env.local) and
// rebuild/restart. Must be NEXT_PUBLIC_* so the value reaches client components.
export const SHOW_FISH = process.env.NEXT_PUBLIC_SHOW_FISH !== '0';
