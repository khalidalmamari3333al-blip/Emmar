import { addMonths, formatDate, periodsOverlap, upcomingMonthStarts } from '@/lib/dates';

describe('dates', () => {
  it('adds months, clamping to the end of shorter months', () => {
    expect(addMonths('2027-01-01', 4)).toBe('2027-05-01');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2027-11-15', 3)).toBe('2028-02-15');
  });

  it('lists upcoming month starts, never the current (already started) month', () => {
    expect(upcomingMonthStarts(new Date(Date.UTC(2026, 9, 9)), 3)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('treats periods as half-open, matching the database constraint', () => {
    expect(periodsOverlap('2027-01-01', '2027-03-01', '2027-02-15', '2027-04-01')).toBe(true);
    expect(periodsOverlap('2027-01-01', '2027-03-01', '2027-03-01', '2027-04-01')).toBe(false); // متتاليان
    expect(periodsOverlap('2027-01-01', '2027-06-01', '2027-02-01', '2027-03-01')).toBe(true); // داخلي
  });

  it('formats dates in both languages', () => {
    expect(formatDate('2027-02-01', 'ar')).toBe('1 فبراير 2027');
    expect(formatDate('2027-02-01', 'en')).toBe('1 Feb 2027');
  });
});
