import { dictionaries, pick } from '@/i18n';
import { mapPropertyRow } from '@/services/properties';

function leaves(obj: object, prefix = ''): [string, unknown][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

describe('i18n dictionaries', () => {
  it('Arabic and English have the same keys and no empty strings', () => {
    const ar = leaves(dictionaries.ar);
    const en = leaves(dictionaries.en);
    expect(ar.map(([k]) => k).sort()).toEqual(en.map(([k]) => k).sort());
    for (const [k, v] of [...ar, ...en]) expect([k, typeof v === 'string' && v.trim().length > 0]).toEqual([k, true]);
  });

  it('pick falls back to the other language when a translation is missing', () => {
    expect(pick({ ar: 'صحار', en: 'Sohar' }, 'en')).toBe('Sohar');
    expect(pick({ ar: 'صحار', en: '' }, 'en')).toBe('صحار');
  });
});

describe('mapPropertyRow', () => {
  it('maps database columns to the bilingual app model', () => {
    const p = mapPropertyRow(
      {
        id: '1', kind: 'rent', type: 'studio', city: 'muscat',
        district_ar: 'الخوير', district_en: 'Al Khuwair', title_ar: 'استوديو', title_en: 'Studio',
        price_omr: '180.500', price_period: 'monthly', bedrooms: null, area_sqm: '45.00',
        cover_image_path: '1/cover.jpg', featured: true,
      },
      (path) => `https://cdn/${path}`,
    );
    expect(p.title).toEqual({ ar: 'استوديو', en: 'Studio' });
    expect(p.priceOmr).toBe(180.5);
    expect(p.areaSqm).toBe(45);
    expect(p.bedrooms).toBeUndefined();
    expect(p.imageUrl).toBe('https://cdn/1/cover.jpg');
  });
});
