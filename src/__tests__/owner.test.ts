import { emptyPropertyInput, mapRequestRow, nextRoomCodes, toNumber, toPropertyRow, validatePropertyInput, whatsappLink } from '@/services/owner';

const valid = {
  ...emptyPropertyInput(),
  titleAr: 'شقة جميلة', titleEn: 'Nice flat', districtAr: 'الخوير', districtEn: 'Al Khuwair', price: '250', bedrooms: '2', area: '120',
};

describe('validatePropertyInput', () => {
  it('accepts a complete listing', () => {
    expect(validatePropertyInput(valid)).toEqual({});
  });

  it('requires both Arabic and English titles and districts', () => {
    const e = validatePropertyInput({ ...valid, titleEn: '', districtAr: ' ' });
    expect(e).toEqual({ titleEn: 'required', districtAr: 'required' });
  });

  it('rejects bad numbers but accepts Arabic-Indic digits', () => {
    expect(validatePropertyInput({ ...valid, price: 'abc' }).price).toBe('invalid_number');
    expect(validatePropertyInput({ ...valid, price: '-5' }).price).toBe('invalid_number');
    expect(validatePropertyInput({ ...valid, bedrooms: '2.5' }).bedrooms).toBe('invalid_number');
    expect(validatePropertyInput({ ...valid, price: '٢٥٠', bedrooms: '٣' })).toEqual({});
  });

  it('rejects a property type that does not fit the listing kind', () => {
    expect(validatePropertyInput({ ...valid, kind: 'rent', type: 'land' }).type).toBe('type_mismatch');
  });
});

describe('toPropertyRow', () => {
  it('derives the price period from the listing kind (as the database requires)', () => {
    expect(toPropertyRow({ ...valid, kind: 'sale', type: 'villa' }).price_period).toBe('total');
    expect(toPropertyRow(valid).price_period).toBe('monthly');
  });

  it('drops bedrooms for student housing and empty optionals to null', () => {
    const r = toPropertyRow({ ...valid, kind: 'student', type: 'student_housing', area: '' });
    expect(r.bedrooms).toBeNull();
    expect(r.area_sqm).toBeNull();
    expect(r.description_ar).toBeNull();
  });

  it('parses "1,500" and "٢٥٠٫٥"', () => {
    expect(toNumber('1,500')).toBe(1500);
    expect(toNumber('٢٥٠٫٥')).toBe(250.5);
  });
});

describe('nextRoomCodes', () => {
  it('numbers rooms by floor and skips existing codes', () => {
    expect(nextRoomCodes(0, [], 3)).toEqual(['001', '002', '003']);
    expect(nextRoomCodes(2, ['201', '203'], 3)).toEqual(['202', '204', '205']);
  });
});

describe('whatsappLink', () => {
  it('handles local Omani, international and Arabic-digit numbers', () => {
    expect(whatsappLink('9123 4567')).toBe('https://wa.me/96891234567');
    expect(whatsappLink('+968 9123 4567')).toBe('https://wa.me/96891234567');
    expect(whatsappLink('00968٩١٢٣٤٥٦٧')).toBe('https://wa.me/96891234567');
    expect(whatsappLink('123')).toBeNull();
  });
});

describe('mapRequestRow', () => {
  it('marks a pending request past its hold as expired', () => {
    const r = mapRequestRow(
      {
        id: '1', status: 'pending', start_date: '2027-01-01', end_date: '2027-05-01', expires_at: '2026-10-01T00:00:00Z',
        monthly_price_omr: '45', created_at: '2026-09-29', bed_code: '1', room_code: '001', floor_level: 0,
        building_name_ar: 'أ', building_name_en: 'A', property_id: 'p', property_title_ar: 'س', property_title_en: 'S',
        requester_name: 'سالم', requester_phone: null,
      },
      new Date('2026-10-09T00:00:00Z'),
    );
    expect(r.status).toBe('expired');
    expect(r.monthlyPriceOmr).toBe(45);
    expect(r.requesterPhone).toBeUndefined();
  });
});
