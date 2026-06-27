/** Delays for the specified number of milliseconds. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
