import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui';
import { useLocale } from '@/i18n';
import { myReviewedBookings } from '@/services/postStay';
import { spacing } from '@/theme';
import { canReviewStay } from '@/types/postStay';

import { ReviewForm } from './ReviewForm';

/** أزرار ما بعد السكن على بطاقة الحجز: صيانة أثناء الإقامة، وتقييم بعد انتهائها. */
export function StayActions({ booking, openMaintenance = (id: string) => router.push(`/maintenance?booking=${id}`) }: { booking: { id: string; status: string; end: string }; openMaintenance?: (id: string) => void }) {
  const { t } = useLocale();
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const ended = canReviewStay(booking, today);
  const maintenanceOpen = booking.status === 'confirmed' && new Date(Date.parse(booking.end) + 14 * 864e5).toISOString().slice(0, 10) >= today;

  useEffect(() => {
    if (!ended) return;
    let active = true;
    myReviewedBookings().then((r) => active && setReviewed(r.ok ? r.data.includes(booking.id) : true));
    return () => {
      active = false;
    };
  }, [ended, booking.id]);

  if (!maintenanceOpen && !(ended && reviewed === false)) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      {maintenanceOpen && <Button small variant="secondary" label={`🔧 ${t.post.requestMaintenance}`} onPress={() => openMaintenance(booking.id)} testID={`maintenance-${booking.id}`} />}
      {ended && reviewed === false && <ReviewForm bookingId={booking.id} onDone={() => setReviewed(true)} />}
    </View>
  );
}
