import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
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
import { colors, radius, spacing } from '@/theme';
import { City, ListingKind, ListingStatus, TYPES_BY_KIND } from '@/types/property';

import { StructureEditor, StructureEditorProps } from './StructureEditor';

const KINDS: ListingKind[] = ['rent', 'sale', 'student'];
const CITIES: City[] = ['sohar', 'muscat'];
const STATUSES: ListingStatus[] = ['draft', 'published', 'archived'];

async function pickFromLibrary(): Promise<ImageAsset | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] });
  return r.canceled || !r.assets[0] ? null : { uri: r.assets[0].uri, mimeType: r.assets[0].mimeType };
}

export interface PropertyEditorProps {
  propertyId?: string;
  load?: (id: string) => Promise<Result<OwnerProperty | null>>;
  create?: (ownerId: string, input: PropertyInput) => Promise<Result<string>>;
  update?: (id: string, input: PropertyInput) => Promise<Result>;
  upload?: (id: string, asset: ImageAsset) => Promise<Result<string>>;
  pickImage?: () => Promise<ImageAsset | null>;
  structure?: Omit<StructureEditorProps, 'propertyId'>;
  onCreated?: (id: string) => void;
  onPreview?: (id: string) => void;
  onBack?: () => void;
}

export function PropertyEditorScreen({
  propertyId,
  load = getOwnerProperty,
  create = createProperty,
  update = updateProperty,
  upload = uploadCover,
  pickImage = pickFromLibrary,
  structure,
  onCreated = () => {},
  onPreview,
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
    if (!r.ok) return setMessage({ text: r.code === 'not_allowed' ? t.owner.notAllowed : r.code === 'not_configured' ? t.notConfigured : t.owner.saveFailed, tone: 'error' });
    setMessage({ text: t.owner.saved, tone: 'success' });
    if (!propertyId && typeof r.data === 'string') onCreated(r.data);
  };

  const changePhoto = async () => {
    if (!propertyId) return;
    const asset = await pickImage();
    if (!asset) return;
    setUploading(true);
    const r = await upload(propertyId, asset);
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

            <Section title={t.owner.sections.photo}>
              {propertyId ? (
                <>
                  {imageUrl && <Image source={{ uri: imageUrl }} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />}
                  <Button label={uploading ? t.owner.uploading : imageUrl ? t.owner.changePhoto : t.owner.pickPhoto} onPress={changePhoto} busy={uploading} variant="secondary" />
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
  cover: { width: '100%', height: 180, borderRadius: radius.md, borderTopLeftRadius: 120, borderTopRightRadius: 120 },
});
