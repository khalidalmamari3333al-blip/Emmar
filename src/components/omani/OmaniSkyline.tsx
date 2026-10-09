import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/** أفق يجمع قلعة تراثية بشُرفاتها وبرجها الدائري مع أبراج سكنية حديثة. رسم أصلي بسيط. */
export function OmaniSkyline({ width = 360, height = 120, color = colors.sand as string, opacity = 0.35 }: { width?: number; height?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 360 120" opacity={opacity}>
      {/* القلعة: سور بشُرفات */}
      <Path
        d="M0 120 V70 h10 v-8 h8 v8 h10 v-8 h8 v8 h10 v-8 h8 v8 h10 V120 Z"
        fill={color}
      />
      {/* البرج الدائري للقلعة */}
      <Path d="M70 120 V40 q0 -6 6 -6 h28 q6 0 6 6 V120 Z" fill={color} />
      <Path d="M70 34 h6 v-7 h6 v7 h8 v-7 h6 v7 h8 v-7 h6 v7" fill="none" stroke={color} strokeWidth={4} />
      {/* بوابة بقوس عُماني */}
      <Path d="M84 120 V92 q6 -12 12 0 V120 Z" fill={colors.background} />
      {/* مبانٍ حديثة */}
      <Rect x={150} y={55} width={36} height={65} rx={3} fill={color} />
      <Rect x={192} y={25} width={30} height={95} rx={3} fill={color} />
      <Rect x={228} y={45} width={42} height={75} rx={3} fill={color} />
      <Path d="M280 120 V60 l20 -20 l20 20 V120 Z" fill={color} />
      <Rect x={326} y={75} width={34} height={45} rx={3} fill={color} />
    </Svg>
  );
}
