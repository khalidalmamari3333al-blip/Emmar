import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Notice } from '@/components/ui';
import { useLocale } from '@/i18n';
import { SResult, submitReview } from '@/services/postStay';
import { colors, font, fonts, spacing } from '@/theme';

/** تقييم إقامة منتهية (القاعدة ترفض غير ذلك). */
export function ReviewForm({ bookingId, submit = submitReview, onDone }: { bookingId: string; submit?: (id: string, rating: number, comment?: string) => Promise<SResult>; onDone?: () => void }) {
  const { t } = useLocale();
  const p = t.post;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  if (!open) return <Button small label={`★ ${p.rateStay}`} onPress={() => setOpen(true)} variant="secondary" testID={`rate-${bookingId}`} />;
  if (msg?.tone === 'success') return <Notice text={msg.text} tone="success" />;

  return (
    <View style={{ gap: spacing.xs }} testID={`review-form-${bookingId}`}>
      <Text style={styles.label}>{p.ratingLabel}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`${n}/5`} testID={`star-${n}`} hitSlop={6}>
            <Text style={[styles.star, n <= rating && { color: colors.accent }]}>★</Text>
          </Pressable>
        ))}
      </View>
      <Field label={p.commentField} value={comment} onChangeText={setComment} multiline maxLength={1000} />
      {msg && <Notice text={msg.text} tone={msg.tone} />}
      <Button
        small
        label={p.sendReview}
        busy={busy}
        disabled={!rating}
        testID={`send-review-${bookingId}`}
        onPress={async () => {
          setBusy(true);
          const r = await submit(bookingId, rating, comment);
          setBusy(false);
          setMsg(r.ok ? { text: p.reviewSent, tone: 'success' } : { text: r.code === 'not_completed' ? p.onlyAfterStay : p.failed, tone: 'error' });
          if (r.ok) onDone?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.textMuted },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 30, color: colors.border },
});
