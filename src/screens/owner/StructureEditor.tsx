import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Field, Notice } from '@/components/ui';
import { LocalizedText, pick, useLocale } from '@/i18n';
import { bedsLiveSource } from '@/services/beds';
import { addBuilding, addFloor, addRooms, deleteRoom, Result, toNumber, updateBed } from '@/services/owner';
import { colors, font, radius, spacing } from '@/theme';
import type { BuildingLayout } from '@/types/layout';

const defaultLoad = async (id: string): Promise<Result<BuildingLayout[]>> => {
  try {
    return { ok: true, data: await bedsLiveSource.layout(id) };
  } catch (e) {
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
};

export interface StructureEditorProps {
  propertyId: string;
  loadLayout?: (propertyId: string) => Promise<Result<BuildingLayout[]>>;
  onAddBuilding?: (propertyId: string, name: LocalizedText) => Promise<Result<string>>;
  onAddFloor?: (buildingId: string, level: number) => Promise<Result<string>>;
  onAddRooms?: typeof addRooms;
  onUpdateBed?: typeof updateBed;
  onDeleteRoom?: typeof deleteRoom;
}

export function StructureEditor({
  propertyId,
  loadLayout = defaultLoad,
  onAddBuilding = addBuilding,
  onAddFloor = addFloor,
  onAddRooms = addRooms,
  onUpdateBed = updateBed,
  onDeleteRoom = deleteRoom,
}: StructureEditorProps) {
  const { t, locale } = useLocale();
  const s = t.owner.structure;
  const [layout, setLayout] = useState<Result<BuildingLayout[]> | null>(null);
  const [reload, setReload] = useState(0);
  const [buildingId, setBuildingId] = useState<string | undefined>();
  const [floorId, setFloorId] = useState<string | undefined>();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [rooms, setRooms] = useState('4');
  const [beds, setBeds] = useState('2');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  useEffect(() => {
    let active = true;
    loadLayout(propertyId).then((r) => active && setLayout(r));
    return () => {
      active = false;
    };
  }, [propertyId, loadLayout, reload]);

  const buildings = layout?.ok ? layout.data : [];
  const building = buildings.find((b) => b.id === buildingId) ?? buildings[0];
  const floor = building?.floors.find((f) => f.id === floorId) ?? building?.floors[0];

  const act = async (fn: () => Promise<Result<unknown>>, onOk?: (r: Result<unknown>) => void, errText = t.owner.saveFailed) => {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      onOk?.(r);
      setReload((n) => n + 1);
    } else setMsg({ text: r.code === 'in_use' ? s.roomInUse : r.code === 'not_allowed' ? t.owner.notAllowed : errText, tone: 'error' });
  };

  const generate = () => {
    if (!floor) return;
    const n = toNumber(rooms);
    const b = toNumber(beds);
    const p = toNumber(price);
    if (!n || !b || p === undefined || Number.isNaN(p) || !Number.isInteger(n) || !Number.isInteger(b) || n < 1 || n > 30 || b < 1 || b > 12 || p < 0)
      return setMsg({ text: s.invalidGenerator, tone: 'error' });
    act(
      () => onAddRooms(floor.id, floor.level, floor.rooms.map((r) => r.code), n, b, p),
      (r) => r.ok && setMsg({ text: s.generated(r.data as number), tone: 'success' }),
    );
  };

  if (!layout) return <Notice text="…" />;
  if (!layout.ok) return <Notice text={t.loadError} tone="error" />;

  return (
    <View style={{ gap: spacing.md }}>
      {/* المباني */}
      {buildings.length > 0 ? (
        <ChipGroup
          testID="struct-building"
          value={building?.id}
          onChange={(v) => {
            setBuildingId(v);
            setFloorId(undefined);
          }}
          options={buildings.map((b) => ({ value: b.id, label: pick(b.name, locale) }))}
        />
      ) : (
        <Notice text={s.noBuildings} />
      )}
      <View style={styles.row}>
        <Field label={s.buildingNameAr} value={nameAr} onChangeText={setNameAr} />
        <Field label={s.buildingNameEn} value={nameEn} onChangeText={setNameEn} />
      </View>
      <Button
        label={s.addBuilding}
        variant="secondary"
        small
        disabled={busy || nameAr.trim().length < 1 || nameEn.trim().length < 1}
        testID="add-building"
        onPress={() =>
          act(
            () => onAddBuilding(propertyId, { ar: nameAr, en: nameEn }),
            (r) => {
              if (r.ok) setBuildingId(r.data as string);
              setNameAr('');
              setNameEn('');
            },
          )
        }
      />

      {/* الطوابق */}
      {building && (
        <View style={styles.floorRow}>
          <View style={{ flex: 1 }}>
            {building.floors.length ? (
              <ChipGroup testID="struct-floor" value={floor?.id} onChange={setFloorId} options={building.floors.map((f) => ({ value: f.id, label: t.beds.floorLabel(f.level) }))} />
            ) : (
              <Notice text={s.noFloors} />
            )}
          </View>
          <Button
            label={s.addFloor}
            small
            variant="secondary"
            disabled={busy}
            testID="add-floor"
            onPress={() => {
              const level = building.floors.length ? Math.max(...building.floors.map((f) => f.level)) + 1 : 0;
              act(() => onAddFloor(building.id, level), (r) => r.ok && setFloorId(r.data as string));
            }}
          />
        </View>
      )}

      {/* الغرف والأسرّة */}
      {floor && (
        <>
          {floor.rooms.length === 0 ? <Notice text={s.noRooms} /> : <Text style={styles.hint}>{s.tapBedHint}</Text>}
          {floor.rooms.map((room) => (
            <View key={room.id} style={styles.room} testID={`struct-room-${room.code}`}>
              <View style={styles.roomHead}>
                <Text style={styles.roomCode}>{t.beds.room(room.code)}</Text>
                <Pressable onPress={() => act(() => onDeleteRoom(room.id))} accessibilityRole="button" disabled={busy}>
                  <Text style={styles.delete}>{s.deleteRoom}</Text>
                </Pressable>
              </View>
              <View style={styles.beds}>
                {room.beds.map((bed) => {
                  const maint = bed.status === 'maintenance';
                  return (
                    <Pressable
                      key={bed.id}
                      testID={`struct-bed-${room.code}-${bed.code}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.beds.bed(bed.code)} ${maint ? t.beds.maintenance : t.beds.available}`}
                      disabled={busy}
                      onPress={() => act(() => onUpdateBed(bed.id, { status: maint ? 'active' : 'maintenance' }))}
                      style={[styles.bed, maint && styles.bedMaint]}
                    >
                      <Text style={[styles.bedText, maint && { color: colors.clay }]}>{bed.code}</Text>
                      <Text style={styles.bedPrice}>{maint ? t.beds.maintenance : `${bed.monthlyPriceOmr}`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.generator}>
            <Text style={styles.genTitle}>{s.generator}</Text>
            <View style={styles.row}>
              <Field label={s.roomsCount} value={rooms} onChangeText={setRooms} keyboardType="number-pad" />
              <Field label={s.bedsPerRoom} value={beds} onChangeText={setBeds} keyboardType="number-pad" />
              <Field label={s.bedPrice} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            </View>
            <Button label={s.generate} onPress={generate} busy={busy} testID="generate-rooms" />
          </View>
        </>
      )}
      {msg && <Notice text={msg.text} tone={msg.tone} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  floorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted },
  room: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.sm, padding: spacing.sm, gap: spacing.xs },
  roomHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomCode: { fontWeight: '800', color: colors.clay, fontSize: font.small },
  delete: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  beds: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bed: { width: 58, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface, alignItems: 'center' },
  bedMaint: { borderStyle: 'dashed', borderColor: colors.sand, backgroundColor: colors.sandLight },
  bedText: { fontWeight: '800', color: colors.primary },
  bedPrice: { fontSize: 10, color: colors.textMuted },
  generator: { gap: spacing.sm, backgroundColor: colors.sandLight, borderRadius: radius.sm, padding: spacing.sm },
  genTitle: { fontWeight: '800', color: colors.text, fontSize: font.small },
});
