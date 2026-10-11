export { colors } from './colors';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
/**
 * الخطوط: El Messiri للعناوين (أناقة بلمسة خطّية تناسب الهوية العُمانية)،
 * وIBM Plex Sans Arabic للنصوص (حديث وواضح بالعربية والإنجليزية).
 * كل وزن خط مستقل حتى يعمل على أندرويد (لا يعتمد على fontWeight).
 */
export const fonts = {
  display: 'ElMessiri_700Bold',
  displayMedium: 'ElMessiri_600SemiBold',
  body: 'IBMPlexSansArabic_400Regular',
  bodyMedium: 'IBMPlexSansArabic_500Medium',
  bodySemi: 'IBMPlexSansArabic_600SemiBold',
  bodyBold: 'IBMPlexSansArabic_700Bold',
} as const;

export const font = { title: 26, h2: 19, body: 15, small: 13 } as const;

export const shadow = {
  shadowColor: '#3B2A1A',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;
