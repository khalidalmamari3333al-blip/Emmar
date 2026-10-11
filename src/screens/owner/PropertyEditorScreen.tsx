import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup, MultiChipGroup } from '@/components/ChipGroup';
import { Button, Field, Gate, Notice, ScreenHeader, Section } from '@/components/ui';
import { useLocale } from '@/i18n';
import { isOwnerRole, useAuth } from '@/lib/auth';
import {
  createProperty,
  emptyPropertyInput,
  getOwnerProperty,
  ImageAsset,
  OwnerProperty,
  PropertyErrors,
  PropertyInput,
  Result,
  updateProperty,
  uploadCover,
  validatePropertyInput,
} from '@/services/owner';
import { colors, font, fonts, radius, spacing } from '@/theme';
import { AMENITIES, CancellationPolicy, City, Furnished, LANDMARKS, ListingKind, ListingStatus, TYPES_BY_KIND, UTILITIES } from '@/types/property';

import { ImageManager, ImageServices, PickedImage } from './ImageManager';

import { StructureEditor, StructureEditorProps } from './StructureEditor';

const KINDS: ListingKind[] = ['rent', 'sale', 'student'];
const CITIES: City[] = ['sohar', 'muscat'];
const STATUSES: ListingStatus[] = ['draft', 'published', 'archived'];
const FURNISHED: Furnished[] = ['unfurnished', 'semi', 'furnished'];
const POLICIES: CancellationPolicy[] = ['flexible', 'moderate', 'strict'];

async function pickFromLibrary(): Promise<PickedImage | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] });
  const a = r.canceled ? undefined : r.assets[0];
  return a ? { uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize } : null;
}

export interface PropertyEditorProps {
  propertyId?: string;
  load?: (id: string) => Promise<Result<OwnerProperty | null>>;
  create?: (ownerId: string, input: PropertyInput) => Promise<Result<string>>;
  update?: (id: string, input: PropertyInput) => Promise<Result>;
  upload?: (id: string, asset: ImageAsset) => Promise<Result<string>>;
  pickImage?: () => Promise<PickedImage | null>;
  /** إدارة الصور المتعددة؛ إن مُرِّر `upload` وحده يبقى رفع الغلاف المفرد (توافق). */
  images?: ImageServices;
  structure?: Omit<StructureEditorProps, 'propertyId'>;
  onCreated?: (id: string) => void;
  onPreview?: (id: string) => void;
  onVerify?: (id: string) => void;
  onBack?: () => void;
}

export function PropertyEditorScreen({
  propertyId,
  load = getOwnerProperty,
  create = createProperty,
  update = updateProperty,
  upload,
  images,
  pickImage = pickFromLibrary,
  structure,
  onCreated = () => {},
  onPreview,
  onVerify,
  onBack,
}: PropertyEditorProps) {
  const { t } = useLocale();
  const auth = useAuth();
  const [input, setInput] = useState<PropertyInput>(emptyPropertyInput);
  const [loaded, setLoaded] = useState(!propertyId);
  const [loadFailed, setLoadFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [errors, setErrors] = useState<PropertyErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    load(propertyId).then((r) => {
      if (!active) return;
      if (r.ok && r.data) {
        setInput(r.data.input);
        setImageUrl(r.data.imageUrl);
      } else setLoadFailed(true);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [propertyId, load]);

  const set = <K extends keyof PropertyInput>(k: K, v: PropertyInput[K]) => {
    setMessage(null);
    setInput((cur) => {
      const next = { ...cur, [k]: v };
      // تغيير نوع العرض يضبط نوع العقار تلقائيًا إن لم يعد مناسبًا
      if (k === 'kind' && !TYPES_BY_KIND[next.kind].includes(next.type)) next.type = TYPES_BY_KIND[next.kind][0];
      return next;
    });
  };
  const err = (k: keyof PropertyInput) => (errors[k] ? t.owner.errors[errors[k]!] : undefined);

  const save = async () => {
    const e = validatePropertyInput(input);
    setErrors(e);
    if (Object.keys(e).length) return setMessage({ text: t.owner.fixErrors, tone: 'error' });
    if (!auth.user) return;
    setSaving(true);
    const r = propertyId ? await update(propertyId, input) : await create(auth.user.id, input);
    setSaving(false);
    setNeedsVerification(!r.ok && r.code === 'needs_verification');
    if (!r.ok && r.code === 'needs_verification') return setMessage({ text: t.verification.publishBlocked, tone: 'error' });
    if (!r.ok) return setMessage({ text: r.code === 'not_allowed' ? t.owner.notAllowed : r.code === 'not_configured' ? t.notConfigured : t.owner.saveFailed, tone: 'error' });
    setMessage({ text: t.owner.saved, tone: 'success' });
    if (!propertyId && typeof r.data === 'string') onCreated(r.data);
  };

  const changePhoto = async () => {
    if (!propertyId) return;
    const asset = await pickImage();
    if (!asset) return;
    setUploading(true);
    const r = await (upload ?? uploadCover)(propertyId, asset);
    setUploading(false);
    if (r.ok) setImageUrl(r.data);
    else setMessage({ text: t.owner.uploadFailed, tone: 'error' });
  };

  const isSale = input.kind === 'sale';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={propertyId ? t.owner.editProperty : t.owner.newProperty} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={isOwnerRole(auth.user) && !loadFailed} loading={auth.status === 'loading' || !loaded} message={loadFailed ? t.detail.notFound : t.owner.notOwner}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Section title={t.owner.sections.basics}>
              <ChipGroup testID="edit-kind" value={input.kind} onChange={(v) => v && set('kind', v)} options={KINDS.map((k) => ({ value: k, label: t.categories[k].title }))} />
              {TYPES_BY_KIND[input.kind].length > 1 && (
                <ChipGroup testID="edit-type" value={input.type} onChange={(v) => v && set('type', v)} options={TYPES_BY_KIND[input.kind].map((x) => ({ value: x, label: t.types[x] }))} />
              )}
            </Section>

            <Section title={t.owner.sections.location}>
              <ChipGroup value={input.city} onChange={(v) => v && set('city', v)} options={CITIES.map((c) => ({ value: c, label: t.cities[c] }))} />
              <View style={styles.row}>
                <Field label={t.owner.fields.districtAr} value={input.districtAr} onChangeText={(v) => set('districtAr', v)} error={err('districtAr')} />
                <Field label={t.owner.fields.districtEn} value={input.districtEn} onChangeText={(v) => set('districtEn', v)} error={err('districtEn')} autoCapitalize="words" />
              </View>
            </Section>

            <Section title={t.owner.sections.titles}>
              <Field label={t.owner.fields.titleAr} value={input.titleAr} onChangeText={(v) => set('titleAr', v)} error={err('titleAr')} maxLength={120} />
              <Field label={t.owner.fields.titleEn} value={input.titleEn} onChangeText={(v) => set('titleEn', v)} error={err('titleEn')} maxLength={120} />
            </Section>

            <Section title={t.owner.sections.price}>
              <Field
                label={isSale ? t.owner.fields.priceTotal : t.owner.fields.priceMonthly}
                value={input.price}
                onChangeText={(v) => set('price', v)}
                error={err('price')}
                hint={input.kind === 'student' ? t.owner.fields.priceStudentHint : undefined}
                keyboardType="decimal-pad"
              />
              <View style={styles.row}>
                {input.kind !== 'student' && (
                  <Field label={t.owner.fields.bedrooms} value={input.bedrooms} onChangeText={(v) => set('bedrooms', v)} error={err('bedrooms')} keyboardType="number-pad" />
                )}
                <Field label={t.owner.fields.area} value={input.area} onChangeText={(v) => set('area', v)} error={err('area')} keyboardType="decimal-pad" />
              </View>
            </Section>

            <Section title={t.owner.sections.description}>
              <Field label={t.owner.fields.descriptionAr} value={input.descriptionAr} onChangeText={(v) => set('descriptionAr', v)} error={err('descriptionAr')} multiline maxLength={2000} />
              <Field label={t.owner.fields.descriptionEn} value={input.descriptionEn} onChangeText={(v) => set('descriptionEn', v)} error={err('descriptionEn')} multiline maxLength={2000} />
            </Section>

            <Section title={t.extras.sections.features}>
              {input.kind !== 'sale' && (
                <ChipGroup testID="edit-furnished" value={input.furnished} onChange={(v) => set('furnished', v ?? undefined)} options={FURNISHED.map((f) => ({ value: f, label: t.features.furnished[f] }))} />
              )}
              <Text style={styles.label}>{t.extras.fields.amenities}</Text>
              <MultiChipGroup testID="edit-amenities" value={input.amenities} onChange={(v) => set('amenities', v)} options={AMENITIES.map((a) => ({ value: a, label: t.features.amenities[a] }))} />
              {input.kind !== 'sale' && (
                <>
                  <Text style={styles.label}>{t.extras.fields.utilities}</Text>
                  <MultiChipGroup testID="edit-utilities" value={input.utilities} onChange={(v) => set('utilities', v)} options={UTILITIES.map((u) => ({ value: u, label: t.features.utilities[u] }))} />
                </>
              )}
              <Text style={styles.label}>{t.extras.fields.landmarks}</Text>
              <MultiChipGroup testID="edit-landmarks" value={input.landmarks} onChange={(v) => set('landmarks', v)} options={LANDMARKS.map((l) => ({ value: l, label: t.features.landmarks[l] }))} />
            </Section>

            {input.kind !== 'sale' && (
              <Section title={t.extras.sections.costs}>
                <View style={styles.row}>
                  <Field label={t.extras.fields.deposit} value={input.deposit} onChangeText={(v) => set('deposit', v)} error={err('deposit')} keyboardType="decimal-pad" testID="edit-deposit" />
                  <Field label={t.extras.fields.fees} value={input.fees} onChangeText={(v) => set('fees', v)} error={err('fees')} keyboardType="decimal-pad" />
                </View>
              </Section>
            )}

            <Section title={t.extras.sections.terms}>
              <Field label={t.extras.fields.rulesAr} value={input.rulesAr} onChangeText={(v) => set('rulesAr', v)} error={err('rulesAr')} multiline maxLength={2000} />
              <Field label={t.extras.fields.rulesEn} value={input.rulesEn} onChangeText={(v) => set('rulesEn', v)} error={err('rulesEn')} multiline maxLength={2000} />
              {input.kind !== 'sale' && (
                <>
                  <Text style={styles.label}>{t.extras.fields.cancellation}</Text>
                  <ChipGroup value={input.cancellationPolicy} onChange={(v) => v && set('cancellationPolicy', v)} options={POLICIES.map((c) => ({ value: c, label: t.features.cancellation[c].title }))} />
                  <Notice text={t.features.cancellation[input.cancellationPolicy].body} />
                </>
              )}
            </Section>

            <Section title={t.owner.sections.photo}>
              {propertyId ? (
                <>
                  {imageUrl && <Image source={{ uri: imageUrl }} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />}
                  {upload && !images ? (
                    <Button label={uploading ? t.owner.uploading : imageUrl ? t.owner.changePhoto : t.owner.pickPhoto} onPress={changePhoto} busy={uploading} variant="secondary" />
                  ) : (
                    <ImageManager propertyId={propertyId} services={images} pickImage={pickImage} onCoverChange={setImageUrl} />
                  )}
                </>
              ) : (
                <Notice text={t.owner.photoAfterSave} />
              )}
            </Section>

            <Section title={t.owner.sections.publishing}>
              <ChipGroup testID="edit-status" value={input.status} onChange={(v) => v && set('status', v)} options={STATUSES.map((s) => ({ value: s, label: t.owner.status[s] }))} />
              <Notice text={t.owner.publishHint} />
            </Section>

            {message && <Notice text={message.text} tone={message.tone} />}
            {needsVerification && propertyId && onVerify && <Button label={t.verification.verifyCta} onPress={() => onVerify(propertyId)} variant="secondary" testID="go-verify" />}
            <Button label={saving ? t.owner.saving : propertyId ? t.owner.save : t.owner.create} onPress={save} busy={saving} testID="save-property" />
            {propertyId && onPreview && input.status === 'published' && <Button label={t.owner.preview} onPress={() => onPreview(propertyId)} variant="ghost" />}

            {input.kind === 'student' && (
              <Section title={t.owner.sections.structure}>
                {propertyId ? <StructureEditor propertyId={propertyId} {...structure} /> : <Notice text={t.owner.structureAfterSave} />}
              </Section>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Gate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: 'row', gap: spacing.sm },
  label: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.textMuted },
  cover: { width: '100%', height: 180, borderRadius: radius.md, borderTopLeftRadius: 120, borderTopRightRadius: 120 },
});
