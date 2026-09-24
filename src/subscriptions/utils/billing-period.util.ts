/**
 * Calendar-aware date calculation for subscription billing periods.
 * Avoids naive 30-day multiplication and properly handles variable month lengths and leap years.
 */
export function calculateNextPeriodEnd(
  startDate: Date = new Date(),
  billingCycle = 'monthly',
): Date {
  const nextEnd = new Date(startDate.getTime());

  switch (billingCycle.toLowerCase()) {
    case 'daily':
      nextEnd.setDate(nextEnd.getDate() + 1);
      break;

    case 'weekly':
      nextEnd.setDate(nextEnd.getDate() + 7);
      break;

    case 'yearly':
    case 'annual':
      nextEnd.setFullYear(nextEnd.getFullYear() + 1);
      break;

    case 'monthly':
    default: {
      const originalDay = nextEnd.getDate();
      const currentMonth = nextEnd.getMonth();

      // Advance by one month
      nextEnd.setMonth(currentMonth + 1);

      // Handle edge cases where current day doesn't exist in target month (e.g. Jan 31 -> Feb 28/29)
      if (nextEnd.getMonth() !== (currentMonth + 1) % 12) {
        nextEnd.setDate(0); // Sets to the last day of the target month
      } else {
        nextEnd.setDate(originalDay);
      }
      break;
    }
  }

  return nextEnd;
}
