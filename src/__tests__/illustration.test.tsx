import { illustrationColors } from '@/components/omani/PropertyIllustration';

describe('illustrationColors', () => {
  it('always returns real colors for any seed (a negative index once left the sky black)', () => {
    const seeds = [...Array.from({ length: 500 }, (_, i) => `mock-${i}`), 'زzz', 'a'.repeat(80), crypto.randomUUID?.() ?? 'x'];
    for (const seed of seeds)
      for (const type of ['villa', 'apartment', 'studio', 'land', 'student_housing'] as const) {
        const c = illustrationColors(type, seed);
        expect(c.sky).toMatch(/^#[0-9A-F]{6}$/i);
        expect(c.wall).toMatch(/^#[0-9A-F]{6}$/i);
      }
  });

  it('is stable per property', () => {
    expect(illustrationColors('villa', 'mock-7')).toEqual(illustrationColors('villa', 'mock-7'));
  });
});
