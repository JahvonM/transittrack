import { describe, it, expect } from 'vitest';
import { vehicleStatusMeta, freshnessOf, formatAge, toneOf, TONES } from '@/components/system/status';

describe('design system status helpers', () => {
  it('describes every stored vehicle status with a tone, label and icon', () => {
    for (const s of ['on_trip', 'idle', 'speeding', 'emergency', 'offline', 'maintenance']) {
      const m = vehicleStatusMeta(s);
      expect(TONES[m.tone]).toBeTruthy();
      expect(m.label).toMatch(/\w/);
      expect(m.icon).toBeTruthy();
    }
    expect(vehicleStatusMeta('on_trip').tone).toBe('live');
    expect(vehicleStatusMeta('emergency').tone).toBe('danger');
  });
  it('falls back to a readable neutral label for unknown statuses', () => {
    expect(vehicleStatusMeta('out_of_area')).toMatchObject({ tone: 'neutral', label: 'Out of area' });
    expect(vehicleStatusMeta(undefined).label).toBe('Unknown');
    expect(toneOf('nope')).toMatchObject(TONES.neutral);
    expect(toneOf('live').fg).toBe('text-primary');
  });
  it('classifies location freshness without inventing a state', () => {
    const now = Date.parse('2026-10-04T12:00:00Z');
    expect(freshnessOf('2026-10-04T11:59:30Z', { now }).state).toBe('live');
    expect(freshnessOf('2026-10-04T11:55:00Z', { now }).state).toBe('stale');
    expect(freshnessOf('2026-10-04T11:00:00Z', { now }).state).toBe('lost');
    expect(freshnessOf(null, { now })).toEqual({ state: 'unknown', ageMs: null });
    expect(freshnessOf('not a date', { now }).state).toBe('unknown');
  });
  it('formats ages for people', () => {
    expect(formatAge(3000)).toBe('just now');
    expect(formatAge(42000)).toBe('42s ago');
    expect(formatAge(5 * 60000)).toBe('5 min ago');
    expect(formatAge(3 * 3600000)).toBe('3 h ago');
  });
});
