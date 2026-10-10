import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Notice } from '@/components/ui';
import { useLocale } from '@/i18n';
import {
  addImage,
  ImageAsset,
  listImages,
  MAX_IMAGES,
  OwnerImage,
  removeImage,
  reorderImages,
  Result,
  setCoverImage,
} from '@/services/owner';
import { colors, font, fonts, radius, spacing } from '@/theme';

export type PickedImage = ImageAsset & { fileSize?: number | null };

export interface ImageServices {
  list: (propertyId: string) => Promise<Result<OwnerImage[]>>;
  add: (propertyId: string, asset: PickedImage, position: number) => Promise<Result<OwnerImage>>;
  setCover: (propertyId: string, imageId: string) => Promise<Result>;
  remove: (propertyId: string, imageId: string) => Promise<Result>;
  reorder: (propertyId: string, orderedIds: string[]) => Promise<Result>;
}

export const defaultImageServices: ImageServices = { list: listImages, add: addImage, setCover: setCoverImage, remove: removeImage, reorder: reorderImages };

/** إدارة صور العقار: إضافة (مع تحقق النوع والحجم)، غلاف، ترتيب، حذف. */
export function ImageManager({
  propertyId,
  services = defaultImageServices,
  pickImage,
  onCoverChange,
}: {
  propertyId: string;
  services?: ImageServices;
  pickImage: () => Promise<PickedImage | null>;
  onCoverChange?: (url?: string) => void;
}) {
  const { t } = useLocale();
  const g = t.extras.gallery;
  const [images, setImages] = useState<OwnerImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const r = await services.list(propertyId);
    const list = r.ok ? r.data : [];
    setImages(list);
    onCoverChange?.(list.find((i) => i.isCover)?.url);
  };

  useEffect(() => {
    let active = true;
    services.list(propertyId).then((r) => active && setImages(r.ok ? r.data : []));
    return () => {
      active = false;
    };
  }, [propertyId, services]);

  const act = async (fn: () => Promise<Result<unknown>>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.message === 'bad_type' ? g.badType : r.message === 'too_large' ? g.tooLarge : r.code === 'not_allowed' ? t.owner.notAllowed : t.owner.uploadFailed);
    await refresh();
    setBusy(false);
  };

  const add = async () => {
    const asset = await pickImage();
    if (asset) await act(() => services.add(propertyId, asset, images?.length ?? 0));
  };

  const move = (index: number, delta: number) => {
    if (!images) return;
    const ids = images.map((i) => i.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    return act(() => services.reorder(propertyId, ids));
  };

  const full = (images?.length ?? 0) >= MAX_IMAGES;

  return (
    <View style={{ gap: spacing.sm }}>
      <Notice text={g.hint} />
      {images?.length === 0 && <Text style={styles.empty}>{g.empty}</Text>}
      {images?.map((img, i) => (
        <View key={img.id} style={styles.item} testID={`image-${img.id}`}>
          <Image source={{ uri: img.url }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={styles.actions}>
            {img.isCover ? <Text style={styles.cover}>★ {g.cover}</Text> : <Small label={g.makeCover} onPress={() => act(() => services.setCover(propertyId, img.id))} disabled={busy} />}
            <View style={styles.row}>
              <Small label={g.moveEarlier} onPress={() => move(i, -1)} disabled={busy || i === 0} />
              <Small label={g.moveLater} onPress={() => move(i, 1)} disabled={busy || i === images.length - 1} />
              <Small label={g.remove} onPress={() => act(() => services.remove(propertyId, img.id))} disabled={busy} danger />
            </View>
          </View>
        </View>
      ))}
      {error && <Notice text={error} tone="error" />}
      {full ? <Notice text={g.max(MAX_IMAGES)} /> : <Button label={busy ? t.owner.uploading : g.add} onPress={add} busy={busy} variant="secondary" testID="add-image" />}
    </View>
  );
}

function Small({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.small, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.smallText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.xs },
  thumb: { width: 84, height: 64, borderRadius: radius.sm, backgroundColor: colors.sandLight },
  actions: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cover: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.accent },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  smallText: { fontFamily: fonts.body, fontSize: font.small, color: colors.primary },
});
