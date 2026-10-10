/** Bound external I/O while preserving input order, including an empty list. */
export async function mapConcurrent<T, R>(values: readonly T[], limit: number, map: (value: T) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Concurrence invalide');
  const entries = values.entries();
  const results: R[] = [];
  async function worker(): Promise<void> {
    for (const [index, value] of entries) results[index] = await map(value);
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}
