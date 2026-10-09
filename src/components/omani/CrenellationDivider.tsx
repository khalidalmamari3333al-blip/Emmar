import { View } from 'react-native';

import { colors } from '@/theme';

/** فاصل على شكل شُرفات أسوار القلاع العُمانية. */
export function CrenellationDivider({ color = colors.sand, count = 12 }: { color?: string; count?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center', marginVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ width: 8, height: i % 2 === 0 ? 8 : 4, backgroundColor: color, opacity: 0.6 }} />
        ))}
      </View>
      <View style={{ width: count * 8, height: 2, backgroundColor: color, opacity: 0.6 }} />
    </View>
  );
}
