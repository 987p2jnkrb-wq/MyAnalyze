export function dbBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'tak'].includes(value.trim().toLowerCase());
}
