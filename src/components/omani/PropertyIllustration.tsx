import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';
import type { PropertyType } from '@/types/property';

/**
 * رسم توضيحي لكل نوع عقار بطابع العمارة العُمانية الحديثة الكلاسيكية:
 * جدران حجرية بيج، نوافذ بأقواس مدببة، شُرفات، ونخيل. يُستخدم حين لا توجد صورة.
 * الدرجة اللونية تتغير حسب المعرّف حتى لا تتشابه البطاقات.
 */
const WALLS = ['#D9C5A6', '#CDB48F', '#E2D2B8', '#D4BC98'];
const SKY = ['#EFE5D5', '#F2E9DC', '#EDE2D0', '#F0E6D8'];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** نافذة بقوس مدبب. */
const archWin = (x: number, y: number, w: number, h: number) => {
  const k = y + w * 0.35;
  return `M${x} ${y + h}V${k}Q${x} ${y + w * 0.12} ${x + w / 2} ${y}Q${x + w} ${y + w * 0.12} ${x + w} ${k}V${y + h}Z`;
};

const crenels = (x: number, y: number, w: number, step = 10) =>
  Array.from({ length: Math.floor(w / step) }, (_, i) => `M${x + i * step + 2} ${y}h${step - 4}v-6h-${step - 4}Z`).join('');

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M0 0 Q2 -22 -1 -44" stroke={colors.clay} strokeWidth={3} fill="none" opacity={0.7} />
      <Path d="M-1 -44 q-14 -2 -22 8 M-1 -44 q14 -2 22 8 M-1 -44 q-10 -10 -20 -8 M-1 -44 q10 -10 20 -8 M-1 -44 q0 -12 2 -16" stroke={colors.success} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.75} />
    </G>
  );
}

/** درجة الجدار والسماء حسب المعرّف (ثابتة لكل عقار). */
export function illustrationColors(type: PropertyType, seed: string) {
  const h = hash(seed + type);
  return { h, wall: WALLS[h % WALLS.length], sky: SKY[(h >>> 3) % SKY.length] }; // >>> وليس >> حتى لا يصبح الفهرس سالبًا
}

export function PropertyIllustration({ type, seed = '', width = 240, height = 130 }: { type: PropertyType; seed?: string; width?: number | string; height?: number | string }) {
  const { h, wall, sky } = illustrationColors(type, seed);
  const win = colors.clay;
  const ground = 118;

  let body: React.ReactNode;
  if (type === 'villa') {
    body = (
      <>
        <Path d={`M60 ${ground}V62H180V${ground}Z ${crenels(60, 62, 120)}`} fill={wall} />
        <Path d={`M100 ${ground}V40H150V62H100Z ${crenels(100, 40, 50)}`} fill={wall} />
        <Path d={archWin(116, 84, 18, 34)} fill={win} opacity={0.75} />
        {[72, 152].map((x) => <Path key={x} d={archWin(x, 78, 16, 22)} fill={win} opacity={0.45} />)}
        <Path d={archWin(118, 46, 14, 14)} fill={win} opacity={0.45} />
        <Palm x={34} y={ground} />
        <Palm x={206} y={ground} s={0.85} />
      </>
    );
  } else if (type === 'apartment' || type === 'studio') {
    const towers = type === 'studio' ? [{ x: 92, w: 56, top: 26 }] : [{ x: 60, w: 58, top: 34 }, { x: 124, w: 62, top: 18 }];
    body = (
      <>
        {towers.map((tw, i) => (
          <G key={i}>
            <Path d={`M${tw.x} ${ground}V${tw.top}H${tw.x + tw.w}V${ground}Z`} fill={wall} />
            <Rect x={tw.x - 3} y={tw.top} width={tw.w + 6} height={4} fill={colors.accent} opacity={0.5} />
            {Array.from({ length: Math.floor((ground - tw.top - 16) / 18) }, (_, r) =>
              [0, 1, 2].map((c) => (
                <Path key={`${r}-${c}`} d={archWin(tw.x + 8 + c * ((tw.w - 16) / 3), tw.top + 10 + r * 18, (tw.w - 16) / 3 - 6, 12)} fill={win} opacity={0.4 + ((r + c + h) % 3) * 0.12} />
              )),
            )}
          </G>
        ))}
        <Palm x={type === 'studio' ? 60 : 36} y={ground} s={0.9} />
        {type === 'studio' && <Palm x={182} y={ground} s={0.75} />}
      </>
    );
  } else if (type === 'land') {
    body = (
      <>
        <Path d="M0 96 L40 70 L70 86 L110 58 L150 84 L190 66 L240 92 V118 H0Z" fill={wall} opacity={0.55} />
        <Path d="M50 116 L90 100 L200 100 L170 116Z" fill="none" stroke={colors.primary} strokeWidth={2} strokeDasharray="5 4" />
        <Circle cx={130} cy={107} r={3} fill={colors.accent} />
        <Palm x={30} y={ground} />
        <Palm x={214} y={ground} s={0.9} />
      </>
    );
  } else {
    // سكن طلابي: مبنى طويل بثلاثة طوابق وقبة صغيرة
    body = (
      <>
        <Path d={`M30 ${ground}V50H210V${ground}Z ${crenels(30, 50, 180)}`} fill={wall} />
        <Path d="M106 50 Q120 24 134 50Z" fill={colors.accent} opacity={0.55} />
        {[0, 1, 2].map((r) =>
          Array.from({ length: 9 }, (_, c) => (
            <Path key={`${r}-${c}`} d={archWin(40 + c * 19.5, 60 + r * 18, 11, 12)} fill={win} opacity={0.35 + ((r * 9 + c + h) % 4) * 0.1} />
          )),
        )}
      </>
    );
  }

  return (
    <Svg width={width} height={height} viewBox="0 0 240 130" preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={240} height={130} fill={sky} />
      <Circle cx={196} cy={30} r={14} fill={colors.accent} opacity={0.25} />
      {body}
      <Rect x={0} y={ground} width={240} height={12} fill={colors.sand} opacity={0.6} />
    </Svg>
  );
}
