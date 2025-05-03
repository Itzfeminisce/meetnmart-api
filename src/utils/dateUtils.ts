/**
 * Duration units with strong typing
 */
type DurationUnit = 
  | 'milliseconds' | 'seconds' | 'minutes' | 'hours' 
  | 'days' | 'weeks' | 'months' | 'years';

/**
 * Duration object with strongly typed unit and amount
 */
interface Duration {
  amount: number;
  unit: DurationUnit;
}

/**
 * Options for date manipulation
 */
interface DateOptions {
  fromDate?: Date;
}

/**
 * Adds duration to a date (or current date if not provided)
 */
export function addDuration(duration: Duration, options?: DateOptions): Date {
  const result = new Date(options?.fromDate ?? new Date());
  
  switch (duration.unit) {
    case 'milliseconds':
      result.setMilliseconds(result.getMilliseconds() + duration.amount);
      break;
    case 'seconds':
      result.setSeconds(result.getSeconds() + duration.amount);
      break;
    case 'minutes':
      result.setMinutes(result.getMinutes() + duration.amount);
      break;
    case 'hours':
      result.setHours(result.getHours() + duration.amount);
      break;
    case 'days':
      result.setDate(result.getDate() + duration.amount);
      break;
    case 'weeks':
      result.setDate(result.getDate() + (duration.amount * 7));
      break;
    case 'months':
      result.setMonth(result.getMonth() + duration.amount);
      break;
    case 'years':
      result.setFullYear(result.getFullYear() + duration.amount);
      break;
    default:
      // This should never happen with proper typing
      const exhaustiveCheck: never = duration.unit;
      throw new Error(`Unhandled unit: ${exhaustiveCheck}`);
  }

  return result;
}

/**
 * Subtracts duration from a date (or current date if not provided)
 */
export function subtractDuration(duration: Duration, options?: DateOptions): Date {
  return addDuration(
    { ...duration, amount: -duration.amount },
    options
  );
}

/**
 * Calculates difference between two dates in specified units
 */
export function dateDiff(
  date1: Date, 
  date2: Date = new Date(), 
  unit: DurationUnit = 'milliseconds'
): number {
  const diff = date1.getTime() - date2.getTime();
  
  switch (unit) {
    case 'milliseconds':
      return diff;
    case 'seconds':
      return diff / 1000;
    case 'minutes':
      return diff / (1000 * 60);
    case 'hours':
      return diff / (1000 * 60 * 60);
    case 'days':
      return diff / (1000 * 60 * 60 * 24);
    case 'weeks':
      return diff / (1000 * 60 * 60 * 24 * 7);
    case 'months':
      return diff / (1000 * 60 * 60 * 24 * 30.436875); // Average month length
    case 'years':
      return diff / (1000 * 60 * 60 * 24 * 365.2425); // Average year length
    default:
      const exhaustiveCheck: never = unit;
      throw new Error(`Unhandled unit: ${exhaustiveCheck}`);
  }
}

/**
 * Helper functions for common duration creations
 */
export const Durations = {
  milliseconds: (amount: number): Duration => ({ amount, unit: 'milliseconds' }),
  seconds: (amount: number): Duration => ({ amount, unit: 'seconds' }),
  minutes: (amount: number): Duration => ({ amount, unit: 'minutes' }),
  hours: (amount: number): Duration => ({ amount, unit: 'hours' }),
  days: (amount: number): Duration => ({ amount, unit: 'days' }),
  weeks: (amount: number): Duration => ({ amount, unit: 'weeks' }),
  months: (amount: number): Duration => ({ amount, unit: 'months' }),
  years: (amount: number): Duration => ({ amount, unit: 'years' }),
};