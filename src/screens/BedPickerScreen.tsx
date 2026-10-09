import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { BedLegend, FloorPlan } from '@/components/FloorPlan';
import { MockBadge, StatusNotice } from '@/components/StatusNotice';
import { pick, useLocale, useT } from '@/i18n';
import { addMonths, formatDate, formatMonthYear, ISODate, upcomingMonthStarts } from '@/lib/dates';
import { useAuth } from '@/lib/auth';
import { getBedAvailability, getBedLayout } from '@/services/beds';
import { BookingRequest, createBookingRequest, CreateResult } from '@/services/bookings';
import { DataResult, formatPrice } from '@/services/properties';
import { colors, font, radius, shadow, spacing } from '@/theme';
import type { Availability, BuildingLayout } from '@/types/layout';

const DURATIONS = [1, 3, 4, 6, 12]; // 4 = فصل دراسي

export interface BedPickerScreenProps {
  propertyId: string;
  loadLayout?: (id: string) => Promise<DataResult<BuildingLayout[]>>;
  loadAvailability?: (id: string, start: ISODate, end: ISODate) => Promise<DataResult<Availability>>;
  today?: Date;
  onBack?: () => void;
  createRequest?: (userId: string, req: BookingRequest) => Promise<CreateResult>;
  onRequireSignIn?: () => void;
  onViewBookings?: () => void;
}

export function BedPickerScreen({
  propertyId,
  loadLayout = getBedLayout,
  loadAvailability = getBedAvailability,
  today,
  onBack,
  createRequest = createBookingRequest,
  onRequireSignIn = () => {},
  onViewBookings = () => {},
}: BedPickerScreenProps) {
  const { t, locale } = useLocale();
  const auth = useAuth();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<CreateResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const starts = useMemo(() => upcomingMonthStarts(today ?? new Date(), 6), [today]);

  const [layoutRes, setLayoutRes] = useState<DataResult<BuildingLayout[]> | null>(null);
  const [buildingId, setBuildingId] = useState<string | undefined>();
  const [floorId, setFloorId] = useState<string | undefined>();
  const [start, setStart] = useState<ISODate>(starts[0]);
  const [months, setMonths] = useState(4);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [avail, setAvail] = useState<{ key: string; result: DataResult<Availability> } | null>(null);

  const end = addMonths(start, months);
  const periodKey = `${start}|${end}|${reloadToken}`;

  useEffect(() => {
    let active = true;
    loadLayout(propertyId).then((r) => active && setLayoutRes(r));
    return () => {
      active = false;
    };
  }, [propertyId, loadLayout]);

  useEffect(() => {
    let active = true;
    loadAvailability(propertyId, start, end).then((r) => active && setAvail({ key: `${start}|${end}|${reloadToken}`, result: r }));
    return () => {
      active = false;
    };
  }, [propertyId, start, end, loadAvailability, reloadToken]);

  const buildings = layoutRes?.status === 'ok' ? layoutRes.data : [];
  const building = buildings.find((b) => b.id === buildingId) ?? buildings[0];
  const floor = building?.floors.find((f) => f.id === floorId) ?? building?.floors[0];
  const availRes = avail?.key === periodKey ? avail.result : null;
  const availability = availRes?.status === 'ok' ? availRes.data : null;
  // إن لم يعد السرير المختار متاحًا في الفترة الجديدة يُلغى اختياره ونخبر المستخدم.
  const selectionLost = Boolean(selectedId && availability && !availability[selectedId] && outcome?.status !== 'ok');
  const selected = selectionLost ? null : selectedId;

  const located = (() => {
    for (const b of buildings)
      for (const f of b.floors)
        for (const r of f.rooms) {
          const bed = r.beds.find((x) => x.id === selected);
          if (bed) return { b, f, r, bed };
        }
    return null;
  })();

  const countFloor = (fl: NonNullable<typeof floor>) => {
    const beds = fl.rooms.flatMap((r) => r.beds);
    return { total: beds.length, free: availability ? beds.filter((b) => availability[b.id]).length : null };
  };

  const isMock = layoutRes?.status === 'ok' && layoutRes.source === 'mock';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        {onBack && (
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text style={styles.back}>{t.detail.back}</Text>
          </Pressable>
        )}
        <Text style={styles.title}>{t.beds.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isMock && <MockBadge />}
        <StatusNotice result={layoutRes} />
        {layoutRes?.status === 'ok' && buildings.length === 0 && <Text style={styles.notice}>{t.beds.noLayout}</Text>}

        {building && floor && (
          <>
            <Text style={styles.label}>{t.beds.startDate}</Text>
            <ChipGroup testID="pick-start" value={start} onChange={(v) => v && setStart(v)} options={starts.map((s) => ({ value: s, label: formatMonthYear(s, locale) }))} />

            <Text style={styles.label}>{t.beds.duration}</Text>
            <ChipGroup
              testID="pick-duration"
              value={months}
              onChange={(v) => v && setMonths(v)}
              options={DURATIONS.map((n) => ({ value: n, label: n === 4 ? `${t.beds.semester} (${t.beds.months(4)})` : t.beds.months(n) }))}
            />

            {buildings.length > 1 && (
              <>
                <Text style={styles.label}>{t.beds.building}</Text>
                <ChipGroup
                  testID="pick-building"
                  value={building.id}
                  onChange={(v) => {
                    setBuildingId(v);
                    setFloorId(undefined);
                  }}
                  options={buildings.map((b) => ({ value: b.id, label: pick(b.name, locale) }))}
                />
              </>
            )}

            <Text style={styles.label}>{t.beds.floor}</Text>
            <ChipGroup
              testID="pick-floor"
              value={floor.id}
              onChange={(v) => setFloorId(v)}
              options={building.floors.map((f) => {
                const c = countFloor(f);
                return { value: f.id, label: c.free == null ? t.beds.floorLabel(f.level) : `${t.beds.floorLabel(f.level)} · ${c.free}` };
              })}
            />

            <View style={styles.planHeader}>
              <Text style={styles.planTitle}>
                {pick(building.name, locale)} — {t.beds.floorLabel(floor.level)}
              </Text>
              {(() => {
                const c = countFloor(floor);
                return c.free != null ? <Text style={styles.count}>{t.beds.availableCount(c.free, c.total)}</Text> : null;
              })()}
            </View>
            <StatusNotice result={availRes} />
            <FloorPlan
              floor={floor}
              availability={availability}
              selectedId={selected}
              onSelect={(bed) => {
                setOutcome(null);
                setSelectedId(bed.id === selected ? null : bed.id);
              }}
            />
            <BedLegend />
            {selectionLost && <Text style={styles.warn}>{t.beds.selectionCleared}</Text>}
          </>
        )}
      </ScrollView>

      {building && (
        <View style={styles.summary} testID="booking-summary">
          {located ? (
            <>
              <Text style={styles.sumTitle}>
                {t.beds.bed(located.bed.code)} · {t.beds.room(located.r.code)} · {t.beds.floorLabel(located.f.level)}
                {buildings.length > 1 ? ` · ${pick(located.b.name, locale)}` : ''}
              </Text>
              <Text style={styles.sumLine}>
                {formatDate(start, locale)} {locale === 'ar' ? '←' : '→'} {formatDate(end, locale)} ({t.beds.months(months)})
              </Text>
              <Text style={styles.sumLine}>
                {formatPrice({ priceOmr: located.bed.monthlyPriceOmr })} {t.currency} {t.beds.perMonth} × {months} ={' '}
                <Text style={styles.total}>
                  {formatPrice({ priceOmr: located.bed.monthlyPriceOmr * months })} {t.currency}
                </Text>
              </Text>
            </>
          ) : (
            <Text style={styles.sumTitle}>{t.beds.selectPrompt}</Text>
          )}
          <RequestAction
            authStatus={auth.status}
            hasSelection={Boolean(located)}
            sending={sending}
            outcome={outcome}
            onRequireSignIn={onRequireSignIn}
            onViewBookings={onViewBookings}
            onSubmit={async () => {
              if (!located || !auth.user) return;
              setSending(true);
              const r = await createRequest(auth.user.id, { bedId: located.bed.id, start, end });
              setSending(false);
              setOutcome(r);
              if (r.status === 'conflict') setSelectedId(null);
              // نحدّث التوفر بعد أي محاولة: إما صار السرير لك، أو سبقك إليه أحد.
              if (r.status === 'ok' || r.status === 'conflict') setReloadToken((n) => n + 1);
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function RequestAction({
  authStatus,
  hasSelection,
  sending,
  outcome,
  onSubmit,
  onRequireSignIn,
  onViewBookings,
}: {
  authStatus: ReturnType<typeof useAuth>['status'];
  hasSelection: boolean;
  sending: boolean;
  outcome: CreateResult | null;
  onSubmit: () => void;
  onRequireSignIn: () => void;
  onViewBookings: () => void;
}) {
  const t = useT();
  if (outcome?.status === 'ok') {
    return (
      <View style={styles.sent} testID="request-sent">
        <Text style={styles.sentTitle}>{t.beds.sentTitle}</Text>
        <Text style={styles.sumLine}>{t.beds.sentBody}</Text>
        <Pressable style={styles.cta} accessibilityRole="button" onPress={onViewBookings}>
          <Text style={styles.ctaText}>{t.beds.viewBookings}</Text>
        </Pressable>
      </View>
    );
  }
  if (authStatus === 'demo' || authStatus === 'not_configured') {
    return (
      <>
        <View style={[styles.cta, styles.ctaDisabled]} accessibilityState={{ disabled: true }} accessibilityRole="button">
          <Text style={styles.ctaText}>{t.beds.sendRequest}</Text>
        </View>
        <Text style={styles.ctaHint}>{authStatus === 'demo' ? t.beds.demoNoBooking : t.notConfigured}</Text>
      </>
    );
  }
  if (authStatus !== 'signed_in') {
    return (
      <Pressable style={styles.cta} accessibilityRole="button" onPress={onRequireSignIn} disabled={authStatus === 'loading'}>
        <Text style={styles.ctaText}>{t.beds.signInToBook}</Text>
      </Pressable>
    );
  }
  const error =
    outcome?.status === 'conflict' ? t.beds.conflict : outcome?.status === 'not_allowed' ? t.beds.notAllowed : outcome ? t.beds.failed : null;
  const disabled = !hasSelection || sending;
  return (
    <>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.cta, disabled && styles.ctaDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: sending }}
        disabled={disabled}
        onPress={onSubmit}
        testID="send-request"
      >
        <Text style={styles.ctaText}>{sending ? t.beds.sending : t.beds.sendRequest}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { color: colors.primary, fontWeight: '700', fontSize: font.body },
  title: { fontSize: font.h2, fontWeight: '800', color: colors.text },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  label: { marginTop: spacing.sm, fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  notice: { color: colors.textMuted, fontSize: font.body, textAlign: 'center', marginTop: spacing.lg },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, flexWrap: 'wrap' },
  planTitle: { fontSize: font.body, fontWeight: '800', color: colors.text },
  count: { fontSize: font.small, color: colors.primary, fontWeight: '700' },
  warn: { color: colors.danger, fontSize: font.small, textAlign: 'center' },
  summary: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, gap: 4, borderTopWidth: 1, borderColor: colors.border, ...shadow },
  sumTitle: { fontSize: font.body, fontWeight: '800', color: colors.text },
  sumLine: { fontSize: font.small, color: colors.textMuted },
  total: { color: colors.primary, fontWeight: '800', fontSize: font.body },
  cta: { marginTop: spacing.sm, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.primary },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: font.body },
  error: { color: colors.danger, fontSize: font.small, textAlign: 'center', marginTop: spacing.xs },
  sent: { gap: 4 },
  sentTitle: { fontSize: font.body, fontWeight: '800', color: colors.primary },
  ctaHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
