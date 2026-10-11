import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** إطار بقوس النوافذ العُمانية المدبب، يُستخدم لأيقونات الفئات. */
export function OmaniArch({ size = 64, fill = colors.sandLight, children, style }: { size?: number; fill?: string; children?: ReactNode; style?: ViewStyle }) {
  const h = size * 1.15;
  return (
    <View style={[{ width: size, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={h} viewBox="0 0 100 115" style={{ position: 'absolute' }}>
        <Path d="M0 115 V50 Q0 18 50 0 Q100 18 100 50 V115 Z" fill={fill} />
      </Svg>
      <View style={{ marginTop: size * 0.2 }}>{children}</View>
    </View>
  );
}
