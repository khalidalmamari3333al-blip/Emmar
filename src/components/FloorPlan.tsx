import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useT } from '@/i18n';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { Availability, BedInfo, FloorLayout, RoomLayout } from '@/types/layout';
import { Pop } from '@/components/motion';

export type BedState = 'available' | 'booked' | 'maintenance' | 'selected' | 'unknown';

export function bedState(bed: BedInfo, availability: Availability | null, selectedId: string | null): BedState {
  if (bed.status === 'maintenance') return 'maintenance';
  if (bed.id === selectedId) return 'selected';
  if (!availability) return 'unknown';
  return availability[bed.id] ? 'available' : 'booked';
}

const SEAT: Record<BedState, { bg: string; border: string; text: string }> = {
  available: { bg: colors.surface, border: colors.primary, text: colors.primary },
  selected: { bg: colors.accent, border: colors.accent, text: colors.white },
  booked: { bg: '#E7E2DB', border: '#D5CEC4', text: '#A79D92' },
  maintenance: { bg: colors.sandLight, border: colors.sand, text: colors.clay },
  unknown: { bg: colors.surface, border: colors.border, text: colors.textMuted },
};

/** مخطط الطابق: الغرف في شبكة حسب موضعها، وداخل كل غرفة أسرّة يمكن اختيارها مثل مقاعد السينما. */
export function FloorPlan({
  floor,
  availability,
  selectedId,
  onSelect,
}: {
  floor: FloorLayout;
  availability: Availability | null;
  selectedId: string | null;
  onSelect: (bed: BedInfo, room: RoomLayout) => void;
}) {
  const rows = [...new Set(floor.rooms.map((r) => r.y))].sort((a, b) => a - b);
  return (
    <View style={styles.plan} testID={`floor-plan-${floor.id}`}>
      {rows.map((y) => (
        <View key={y} style={styles.row}>
          {floor.rooms
            .filter((r) => r.y === y)
            .sort((a, b) => a.x - b.x)
            .map((room) => (
              <Room key={room.id} room={room} availability={availability} selectedId={selectedId} onSelect={onSelect} />
            ))}
        </View>
      ))}
    </View>
  );
}

function Room({ room, availability, selectedId, onSelect }: { room: RoomLayout; availability: Availability | null; selectedId: string | null; onSelect: (bed: BedInfo, room: RoomLayout) => void }) {
  const t = useT();
  return (
    <View style={[styles.room, { flex: room.w }]}>
      <Text style={styles.roomLabel}>{t.beds.room(room.code)}</Text>
      <View style={styles.beds}>
        {room.beds.map((bed) => {
          const state = bedState(bed, availability, selectedId);
          const disabled = state === 'booked' || state === 'maintenance' || state === 'unknown';
          const c = SEAT[state];
          const stateLabel = { available: t.beds.available, booked: t.beds.booked, maintenance: t.beds.maintenance, selected: t.beds.selected, unknown: '…' }[state];
          return (
            <Pop key={bed.id} active={state === 'selected'}>
            <Pressable
              testID={`bed-${bed.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${t.beds.bed(bed.code)}، ${t.beds.room(room.code)}، ${stateLabel}`}
              accessibilityState={{ disabled, selected: state === 'selected' }}
              disabled={disabled}
              onPress={() => onSelect(bed, room)}
              style={({ pressed }) => [styles.seat, { backgroundColor: c.bg, borderColor: c.border }, state === 'maintenance' && styles.dashed, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <BedGlyph color={c.text} />
              <Text style={[styles.seatCode, { color: c.text }]}>{bed.code}</Text>
            </Pressable>
            </Pop>
          );
        })}
      </View>
    </View>
  );
}

function BedGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={14} viewBox="0 0 20 14" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round">
      <Path d="M1 13V2M1 9h18v4M19 9V7.5A2.5 2.5 0 0 0 16.5 5H8v4" />
      <Path d="M3 5.5h3v2.5H3z" />
    </Svg>
  );
}

export function BedLegend() {
  const t = useT();
  const items: [BedState, string][] = [
    ['available', t.beds.available],
    ['selected', t.beds.selected],
    ['booked', t.beds.booked],
    ['maintenance', t.beds.maintenance],
  ];
  return (
    <View style={styles.legend}>
      {items.map(([s, label]) => (
        <View key={s} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: SEAT[s].bg, borderColor: SEAT[s].border }, s === 'maintenance' && styles.dashed]} />
          <Text style={styles.legendText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { backgroundColor: colors.sandLight, borderRadius: radius.md, borderWidth: 3, borderColor: colors.sand, padding: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  room: { backgroundColor: colors.background, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.sand, padding: spacing.sm, gap: spacing.xs },
  roomLabel: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.clay },
  beds: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  seat: { width: 48, height: 48, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 1 },
  seatCode: { fontFamily: fonts.bodyBold, fontSize: 12 },
  dashed: { borderStyle: 'dashed' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5 },
  legendText: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
});
