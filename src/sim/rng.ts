// A seeded PRNG kept in the sim state (no Math.random in the sim). xorshift32.

export function nextRandom(state: { rng: number }): number {
  let x = state.rng | 0 || 0x2545f491;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x | 0;
  return (x >>> 0) / 4294967296;
}
