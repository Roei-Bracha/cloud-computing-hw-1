/**
 * Calculate fee: $10/hour, prorated per 15 minutes => $2.50 per quarter-hour
 */
export function calculateFee(durationMs: number): number {
    const minutes = Math.ceil(durationMs / 60000);
    const quarters = Math.ceil(minutes / 15);
    return quarters * 2.5;
  }