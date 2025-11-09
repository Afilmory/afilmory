export function backoffDelay(attempt: number, baseMs = 300, maxMs = 4000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1))
  const jitter = Math.random() * 0.3 * exp
  return Math.floor(exp + jitter)
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}
