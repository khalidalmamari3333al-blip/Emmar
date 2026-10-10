import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Field, Gate, Notice, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { getOwnerProperty, OwnerProperty, Result } from '@/services/owner';
import * as svc from '@/services/verification';
import { colors, spacing } from '@/theme';
import type { City } from '@/types/property';
import { DeclaredData, DOC_TYPES, DocType, VerificationRequest, VerificationSubject } from '@/types/verification';

import { ChecksList, Decisions, DocumentRow, Notices, StatusLayers, styles as part } from './parts';

export interface VerificationServices {
  latest: typeof svc.getLatestRequest;
  start: typeof svc.startRequest;
  saveDeclared: typeof svc.saveDeclared;
  setIdentity: typeof svc.setIdentityNumber;
  upload: typeof svc.uploadDocument;
  remove: typeof svc.removeDocument;
  submit: typeof svc.submitRequest;
  landlord: typeof svc.getLandlordProfile;
  saveLandlord: typeof svc.saveLandlordProfile;
  documentUrl: typeof svc.documentUrl;
  property: (id: string) => Promise<Result<OwnerProperty | null>>;
}

export const defaultVerificationServices: VerificationServices = {
  latest: svc.getLatestRequest, start: svc.startRequest, saveDeclared: svc.saveDeclared, setIdentity: svc.setIdentityNumber,
  upload: svc.uploadDocument, remove: svc.removeDocument, submit: svc.submitRequest, landlord: svc.getLandlordProfile,
  saveLandlord: svc.saveLandlordProfile, documentUrl: svc.documentUrl, property: getOwnerProperty,
};

async function pickDocumentFromDevice(): Promise<svc.PickedDocument | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
  const a = r.canceled ? undefined : r.assets[0];
  return a ? { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size } : null;
}

const CITIES: City[] = ['sohar', 'muscat'];

export interface VerificationScreenProps {
  subject: VerificationSubject;
  propertyId?: string;
  services?: VerificationServices;
  pickDocument?: () => Promise<svc.PickedDocument | null>;
  onBack?: () => void;
}

export function VerificationScreen({ subject, propertyId, services = defaultVerificationServices, pickDocument = pickDocumentFromDevice, onBack }: VerificationScreenProps) {
  const { t, locale } = useLocale();
  const v = t.verification;
  const auth = useAuth();
  const [req, setReq] = useState<VerificationRequest | null | undefined>(undefined);
  const [property, setProperty] = useState<OwnerProperty | null>(null);
  // نموذج البيانات مرتبط بالطلب؛ لا يُستبدل بنسخة الخادم إلا عند تحميل طلب آخر (حتى لا تضيع الكتابة غير المحفوظة)
  const [form, setForm] = useState<{ forId?: string; data: DeclaredData }>({ data: {} });
  const declared = form.data;
  const setDeclared = (fn: (d: DeclaredData) => DeclaredData) => setForm((f) => ({ ...f, data: fn(f.data) }));
  const [landlord, setLandlord] = useState({ accountType: 'individual' as 'individual' | 'company', legalName: '', companyCr: '', loaded: false });
  const [identity, setIdentity] = useState('');
  const [docType, setDocType] = useState<DocType>(DOC_TYPES[subject][0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);
  const signedIn = !!auth.user;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    (async () => {
      const r = await services.latest(subject, propertyId);
      const p = propertyId ? await services.property(propertyId) : null;
      const l = subject === 'landlord' ? await services.landlord() : null;
      return { data: r.ok ? r.data : null, p, l };
    })().then(({ data, p, l }) => {
      if (!active) return;
      setReq(data);
      if (data)
        setForm((f) =>
          f.forId === data.id ? f : { forId: data.id, data: { deedNumber: data.deedNumber, declaredOwnerName: data.declaredOwnerName, plotNumber: data.plotNumber, declaredCity: data.declaredCity } },
        );
      if (p?.ok) setProperty(p.data);
      const ld = l?.ok ? l.data : null;
      if (ld) setLandlord((cur) => (cur.loaded ? cur : { accountType: ld.accountType, legalName: ld.legalName, companyCr: ld.companyCr, loaded: true }));
    });
    return () => {
      active = false;
    };
  }, [signedIn, services, subject, propertyId, reload]);

  const errText = (code: svc.VerificationError) =>
    code === 'bad_type' ? v.badType : code === 'too_large' ? v.tooLarge : code === 'not_allowed' ? t.owner.notAllowed : code === 'invalid' ? t.owner.fixErrors : v.failed;

  const act = async (fn: () => Promise<svc.VResult<unknown>>, success?: string) => {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg({ text: errText(r.code), tone: 'error' });
    else if (success) setMsg({ text: success, tone: 'success' });
    load();
    return r.ok;
  };

  const editable = req && (req.status === 'draft' || req.status === 'needs_info');
  const canStart = req === null || (req && (req.status === 'rejected' || req.status === 'cancelled' || (req.status === 'approved' && subject === 'property' && !!property && property.verificationStatus !== 'verified')));

  const saveAll = () =>
    act(async () => {
      if (subject === 'property') return services.saveDeclared(req!.id, declared);
      const r = await services.saveLandlord({ accountType: landlord.accountType, legalName: landlord.legalName, companyCr: landlord.companyCr });
      if (!r.ok || !identity.trim()) return r;
      const id = await services.setIdentity(req!.id, identity);
      if (id.ok) setIdentity('');
      return id;
    }, v.saved);

  const addDoc = async () => {
    const file = await pickDocument();
    if (file && req) await act(() => services.upload(req, docType, file));
  };

  const submit = async () => {
    // نحفظ البيانات أولًا حتى لا تُرسل نسخة قديمة
    if (!(await saveAll())) return;
    await act(() => services.submit(req!.id), v.submitted);
  };

  const title = subject === 'property' ? v.title : v.landlordTitle;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={title} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={!!auth.user} loading={auth.status === 'loading' || req === undefined} message={t.owner.notOwner}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            {property && <Text style={part.h3}>{pick(property.title, locale)}</Text>}
            <Text style={part.body}>{subject === 'property' ? v.intro : v.landlordIntro}</Text>
            <Notices />

            {req && <StatusLayers request={req} publication={property?.status} />}
            {req && <Decisions request={req} />}
            {req && <ChecksList checks={req.checks} />}

            {canStart && <Button label={v.start} onPress={() => act(() => services.start(subject, propertyId))} busy={busy} testID="start-verification" />}

            {editable && (
              <>
                <View style={part.card}>
                  <Text style={part.h3}>{v.declared}</Text>
                  <Notice text={v.noOcr} />
                  {subject === 'property' ? (
                    <>
                      <Field label={v.fields.deedNumber} hint={v.fields.deedHint} value={declared.deedNumber ?? ''} onChangeText={(x) => setDeclared((d) => ({ ...d, deedNumber: x }))} autoCapitalize="characters" testID="deed-number" />
                      <Field label={v.fields.ownerName} value={declared.declaredOwnerName ?? ''} onChangeText={(x) => setDeclared((d) => ({ ...d, declaredOwnerName: x }))} testID="deed-owner" />
                      <Field label={v.fields.plotNumber} value={declared.plotNumber ?? ''} onChangeText={(x) => setDeclared((d) => ({ ...d, plotNumber: x }))} />
                      <Text style={part.label}>{v.fields.city}</Text>
                      <ChipGroup testID="deed-city" value={declared.declaredCity} onChange={(c) => setDeclared((d) => ({ ...d, declaredCity: c ?? undefined }))} options={CITIES.map((c) => ({ value: c, label: t.cities[c] }))} />
                    </>
                  ) : (
                    <>
                      <Text style={part.label}>{v.fields.accountType}</Text>
                      <ChipGroup
                        value={landlord.accountType}
                        onChange={(x) => x && setLandlord((l) => ({ ...l, accountType: x }))}
                        options={[{ value: 'individual' as const, label: v.fields.individual }, { value: 'company' as const, label: v.fields.company }]}
                      />
                      <Field label={v.fields.legalName} value={landlord.legalName} onChangeText={(x) => setLandlord((l) => ({ ...l, legalName: x }))} testID="legal-name" />
                      {landlord.accountType === 'company' ? (
                        <Field label={v.fields.companyCr} value={landlord.companyCr} onChangeText={(x) => setLandlord((l) => ({ ...l, companyCr: x }))} />
                      ) : (
                        <Field
                          label={v.fields.identity}
                          hint={req.identityLast4 ? v.fields.identitySaved(req.identityLast4) : v.fields.identityHint}
                          value={identity}
                          onChangeText={setIdentity}
                          keyboardType="number-pad"
                          secureTextEntry
                          testID="identity"
                        />
                      )}
                    </>
                  )}
                  <Button label={v.saveData} onPress={saveAll} busy={busy} variant="secondary" />
                </View>

                <View style={part.card}>
                  <Text style={part.h3}>{v.documents}</Text>
                  <Text style={part.meta}>{v.docHint}</Text>
                  {req.documents.map((d) => (
                    <DocumentRow key={d.id} doc={d} open={services.documentUrl} onRemove={() => act(() => services.remove(d.id, d.path))} onError={(text) => setMsg({ text, tone: 'error' })} />
                  ))}
                  <ChipGroup testID="doc-type" value={docType} onChange={(x) => x && setDocType(x)} options={DOC_TYPES[subject].map((d) => ({ value: d, label: v.docTypes[d] }))} />
                  <Button label={v.addDocument} onPress={addDoc} busy={busy} variant="secondary" testID="add-document" />
                </View>
              </>
            )}

            {msg && <Notice text={msg.text} tone={msg.tone} />}
            {editable && <Button label={req.status === 'needs_info' ? v.resubmit : v.submit} onPress={submit} busy={busy} testID="submit-verification" />}
            {req && !editable && req.documents.length > 0 && (
              <View style={part.card}>
                <Text style={part.h3}>{v.documents}</Text>
                {req.documents.map((d) => (
                  <DocumentRow key={d.id} doc={d} open={services.documentUrl} onError={(text) => setMsg({ text, tone: 'error' })} />
                ))}
              </View>
            )}
            <Notice text={v.aiNote} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Gate>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
});
