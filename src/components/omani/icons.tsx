import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

type P = { size?: number; color?: ColorValue };

export const KeyIcon = ({ size = 28, color = colors.primary }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
    <Circle cx={8} cy={12} r={4} />
    <Path d="M12 12h9M18 12v3M21 12v2" />
  </Svg>
);

export const HouseIcon = ({ size = 28, color = colors.primary }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round">
    <Path d="M3 11 L12 4 L21 11 V20 H3 Z" />
    <Path d="M10 20 V15 q2 -3 4 0 V20" />
  </Svg>
);

export const BedIcon = ({ size = 28, color = colors.primary }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
    <Path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
    <Rect x={5} y={10} width={4} height={3} rx={1} />
  </Svg>
);

export const SearchIcon = ({ size = 20, color = colors.textMuted }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
    <Circle cx={11} cy={11} r={7} />
    <Path d="M20 20l-4-4" />
  </Svg>
);
