import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * صف أقواس مدببة كواجهة دار الأوبرا السلطانية: أعمدة رفيعة وأقواس عالية،
 * مع إفريز علوي بشُرفات خفيفة. رسم أصلي بسيط.
 */
export function OmaniArcade({ width = 400, height = 120, color = colors.sand, opacity = 0.5, arches = 7 }: { width?: number; height?: number; color?: string; opacity?: number; arches?: number }) {
  const w = 400 / arches;
  const col = 6;
  const base = 120;
  const spring = 62;
  const apex = 30;
  const paths = Array.from({ length: arches }, (_, i) => {
    const x1 = i * w + col;
    const x2 = (i + 1) * w - col;
    const mid = (x1 + x2) / 2;
    const k = spring - (spring - apex) * 0.55;
    return `M${x1} ${base}V${spring}Q${x1} ${k} ${mid} ${apex}Q${x2} ${k} ${x2} ${spring}V${base}Z`;
  });
  return (
    <Svg width={width} height={height} viewBox="0 0 400 120" opacity={opacity} preserveAspectRatio="xMidYMax slice">
      {/* الإفريز العلوي بشُرفات صغيرة */}
      <Rect x={0} y={14} width={400} height={6} fill={color} />
      {Array.from({ length: 25 }, (_, i) => (
        <Rect key={i} x={i * 16 + 4} y={6} width={8} height={8} fill={color} />
      ))}
      {/* الجدار بالأقواس كفراغات */}
      <Path d={`M0 20H400V120H0Z ${paths.join(' ')}`} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
