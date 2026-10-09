import { ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

const native = Platform.OS !== 'web';

/** يحترم إعداد "تقليل الحركة" في الجهاز. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => active && setReduced(v), () => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}

/** ظهور ناعم: تلاشٍ مع صعود خفيف. `delay` لتتابع العناصر واحدًا بعد الآخر. */
export function FadeIn({ children, delay = 0, distance = 14, style }: { children: ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 420, delay: Math.min(delay, 600), easing: Easing.out(Easing.cubic), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [v, delay]);
  if (reduced) return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** تأخير متدرج لعناصر القوائم (يتوقف بعد بضعة عناصر حتى لا يطول الانتظار). */
export const stagger = (index: number, step = 60) => Math.min(index, 8) * step;

/** زر/بطاقة تنكمش قليلًا عند اللمس ثم ترجع بنابض. */
export function PressableScale({
  children,
  style,
  containerStyle,
  scaleTo = 0.97,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; scaleTo?: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [s] = useState(() => new Animated.Value(1));
  const to = (value: number) => Animated.spring(s, { toValue: value, useNativeDriver: native, speed: 40, bounciness: value === 1 ? 6 : 0 }).start();
  return (
    <Pressable
      {...props}
      style={containerStyle}
      onPressIn={(e) => {
        if (!reduced) to(scaleTo);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) to(1);
        props.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** "نبضة" عند تحوّل القيمة إلى true (مثل اختيار سرير). */
export function Pop({ active, children, style }: { active: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [s] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active || reduced) return;
    s.setValue(0.85);
    Animated.spring(s, { toValue: 1, useNativeDriver: native, speed: 18, bounciness: 12 }).start();
  }, [active, reduced, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}
