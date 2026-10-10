import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Notice } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { propertyReviews, replyToReview, SResult } from '@/services/postStay';
import { colors, font, fonts, radius, spacing } from '@/theme';
import { averageRating, PublicReview } from '@/types/postStay';

export interface ReviewsServices {
  load: (propertyId: string) => Promise<SResult<PublicReview[]>>;
  reply: (reviewId: string, text: string) => Promise<SResult>;
}
const defaults: ReviewsServices = { load: propertyReviews, reply: replyToReview };

const stars = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

export function ReviewsSection({ propertyId, ownerId, services = defaults }: { propertyId: string; ownerId?: string; services?: ReviewsServices }) {
  const { t, locale } = useLocale();
  const p = t.post;
  const auth = useAuth();
  const [res, setRes] = useState<SResult<PublicReview[]> | null>(null);
  const [reload, setReload] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const isOwner = !!auth.user && auth.user.id === ownerId;

  useEffect(() => {
    let active = true;
    services.load(propertyId).then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [propertyId, services, reload]);

  if (!res || !res.ok) return null;
  const list = res.data;
  const avg = averageRating(list);

  return (
    <View style={{ gap: spacing.sm }} testID="reviews">
      <Text style={styles.h2}>{p.reviews}</Text>
      {avg != null ? <Text style={styles.avg}>{p.average(avg, list.length)}</Text> : <Text style={styles.meta}>{p.noReviews}</Text>}
      {list.map((r) => (
        <View key={r.id} style={styles.card} testID={`review-${r.id}`}>
          <View style={styles.row}>
            <Text style={styles.name}>{r.reviewer}</Text>
            <Text style={styles.stars} accessibilityLabel={`${r.rating}/5`}>
              {stars(r.rating)}
            </Text>
          </View>
          <Text style={styles.meta}>{p.stayEnded(formatDate(r.stayEnd, locale))}</Text>
          {r.comment ? <Text style={styles.body}>{r.comment}</Text> : null}
          {r.landlordReply ? (
            <View style={styles.reply}>
              <Text style={styles.meta}>{p.landlordReply}</Text>
              <Text style={styles.body}>{r.landlordReply}</Text>
            </View>
          ) : (
            isOwner && (
              <View style={{ gap: spacing.xs }}>
                <Field label={p.reply} value={drafts[r.id] ?? ''} onChangeText={(v) => setDrafts((d) => ({ ...d, [r.id]: v }))} testID={`reply-${r.id}`} />
                <Button
                  small
                  variant="secondary"
                  label={p.reply}
                  onPress={async () => {
                    const out = await services.reply(r.id, drafts[r.id] ?? '');
                    setMsg(out.ok ? p.replySent : p.failed);
                    if (out.ok) setReload((n) => n + 1);
                  }}
                />
              </View>
            )
          )}
        </View>
      ))}
      {msg && <Notice text={msg} />}
    </View>
  );
}

const styles = StyleSheet.create({
  h2: { fontFamily: fonts.displayMedium, fontSize: font.h2, color: colors.text, marginTop: spacing.md },
  avg: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.accent },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: fonts.bodySemi, fontSize: font.body, color: colors.text },
  stars: { color: colors.accent, fontSize: font.body, letterSpacing: 1 },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text, lineHeight: 22 },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  reply: { borderStartWidth: 3, borderStartColor: colors.sand, paddingStart: spacing.sm, marginTop: spacing.xs, gap: 2 },
});
