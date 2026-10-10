import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isAdminRole, useAuth } from '@/lib/auth';
import { ltr } from '@/lib/bidi';
import {
  adminAuditLog,
  adminListUsers,
  AuditEntry,
  adminSetFeatured,
  adminSetRole,
  AdminUser,
  listAllProperties,
  OwnerProperty,
  Result,
  setPropertyStatus,
} from '@/services/owner';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { ListingStatus } from '@/types/property';

export interface AdminScreenProps {
  listUsers?: (search: string) => Promise<Result<AdminUser[]>>;
  setRole?: (id: string, role: AdminUser['role']) => Promise<Result>;
  listProperties?: (status?: ListingStatus) => Promise<Result<OwnerProperty[]>>;
  setFeatured?: (id: string, featured: boolean) => Promise<Result>;
  setStatus?: (id: string, status: ListingStatus) => Promise<Result>;
  auditLog?: (entity?: string) => Promise<Result<AuditEntry[]>>;
  onOpenProperty?: (id: string) => void;
  onBack?: () => void;
  debounceMs?: number;
}

const ROLES: AdminUser['role'][] = ['user', 'owner', 'admin'];

export function AdminScreen(props: AdminScreenProps) {
  const { t } = useLocale();
  const auth = useAuth();
  const [tab, setTab] = useState<'users' | 'properties' | 'audit'>('users');
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t.admin.dashboard} onBack={props.onBack} backLabel={t.detail.back} />
      <Gate allowed={isAdminRole(auth.user)} loading={auth.status === 'loading'} message={t.admin.notAdmin}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <ChipGroup testID="admin-tab" value={tab} onChange={(v) => v && setTab(v)} options={[{ value: 'users', label: t.admin.tabs.users }, { value: 'properties', label: t.admin.tabs.properties }, { value: 'audit', label: t.admin.tabs.audit }]} />
        </View>
        {tab === 'users' ? <UsersTab {...props} selfId={auth.user?.id} /> : tab === 'properties' ? <PropertiesTab {...props} /> : <AuditTab {...props} />}
      </Gate>
    </SafeAreaView>
  );
}

function UsersTab({ listUsers = adminListUsers, setRole = adminSetRole, selfId, debounceMs = 300 }: AdminScreenProps & { selfId?: string }) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [res, setRes] = useState<Result<AdminUser[]> | null>(null);
  const [reload, setReload] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search), debounceMs);
    return () => clearTimeout(id);
  }, [search, debounceMs]);

  useEffect(() => {
    let active = true;
    listUsers(query).then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [query, listUsers, reload]);

  const change = async (u: AdminUser, role: AdminUser['role']) => {
    const r = await setRole(u.id, role);
    setMsg(r.ok ? { text: t.admin.roleChanged, tone: 'success' } : { text: t.admin.roleFailed, tone: 'error' });
    if (r.ok) setReload((n) => n + 1);
  };

  return (
    <FlatList
      data={res?.ok ? res.data : []}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <TextInput value={search} onChangeText={setSearch} placeholder={t.admin.searchUsers} placeholderTextColor={colors.textMuted} style={styles.search} accessibilityLabel={t.admin.searchUsers} autoCapitalize="none" />
          {res && !res.ok && <Notice text={t.loadError} tone="error" />}
          {msg && <Notice text={msg.text} tone={msg.tone} />}
        </View>
      }
      ListEmptyComponent={res?.ok ? <Notice text={t.admin.noUsers} /> : null}
      renderItem={({ item: u }) => (
        <View style={styles.card} testID={`user-${u.id}`}>
          <Text style={styles.title}>
            {u.fullName || ltr(u.email)} {u.id === selfId ? `(${t.admin.you})` : ''}
          </Text>
          <Text style={styles.meta}>
            {ltr(u.email)}
            {u.phone ? ` · ${ltr(u.phone)}` : ''}
          </Text>
          {u.id === selfId ? (
            <Pill label={t.admin.roles[u.role]} tone="accent" />
          ) : (
            <ChipGroup testID={`role-${u.id}`} value={u.role} onChange={(v) => v && v !== u.role && change(u, v)} options={ROLES.map((r) => ({ value: r, label: t.admin.roles[r] }))} />
          )}
        </View>
      )}
    />
  );
}

function PropertiesTab({ listProperties = listAllProperties, setFeatured = adminSetFeatured, setStatus = setPropertyStatus, onOpenProperty = () => {} }: AdminScreenProps) {
  const { t, locale } = useLocale();
  const [status, setStatusFilter] = useState<ListingStatus | undefined>();
  const [res, setRes] = useState<Result<OwnerProperty[]> | null>(null);
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listProperties(status).then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [status, listProperties, reload]);

  const run = async (fn: () => Promise<Result>) => {
    const r = await fn();
    setFailed(!r.ok);
    if (r.ok) setReload((n) => n + 1);
  };

  return (
    <FlatList
      data={res?.ok ? res.data : []}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <ChipGroup
            testID="admin-status"
            allLabel={t.admin.filterAll}
            value={status}
            onChange={setStatusFilter}
            options={(['published', 'draft', 'archived'] as ListingStatus[]).map((s) => ({ value: s, label: t.owner.status[s] }))}
          />
          {res && !res.ok && <Notice text={t.loadError} tone="error" />}
          {failed && <Notice text={t.owner.saveFailed} tone="error" />}
        </View>
      }
      ListEmptyComponent={res?.ok ? <Notice text={t.admin.noProperties} /> : null}
      renderItem={({ item: p }) => (
        <View style={styles.card} testID={`admin-property-${p.id}`}>
          <Text style={styles.title} onPress={() => onOpenProperty(p.id)}>
            {pick(p.title, locale)}
          </Text>
          <Text style={styles.meta}>
            {t.cities[p.city]} · {t.categories[p.kind].title}
          </Text>
          <View style={styles.row}>
            <Pill label={t.owner.status[p.status]} tone={p.status === 'published' ? 'good' : p.status === 'draft' ? 'warn' : 'neutral'} />
            {p.featured && <Pill label={t.owner.featured} tone="accent" />}
          </View>
          <View style={styles.row}>
            <Button small variant="secondary" label={p.featured ? t.admin.unfeature : t.admin.feature} onPress={() => run(() => setFeatured(p.id, !p.featured))} testID={`feature-${p.id}`} />
            {p.status !== 'published' && <Button small variant="secondary" label={t.admin.publish} onPress={() => run(() => setStatus(p.id, 'published'))} />}
            {p.status !== 'archived' && <Button small variant="danger" label={t.admin.archive} onPress={() => run(() => setStatus(p.id, 'archived'))} testID={`archive-${p.id}`} />}
          </View>
        </View>
      )}
    />
  );
}

const AUDIT_ENTITIES = ['profile', 'property', 'booking'] as const;

/** سجل التدقيق: للقراءة فقط (لا يمكن تعديله أو حذفه حتى من المدير). */
function AuditTab({ auditLog = adminAuditLog }: AdminScreenProps) {
  const { t, locale } = useLocale();
  const a = t.extras.audit;
  const [entity, setEntity] = useState<(typeof AUDIT_ENTITIES)[number] | undefined>();
  const [res, setRes] = useState<{ entity?: string; r: Result<AuditEntry[]> } | null>(null);

  useEffect(() => {
    let active = true;
    auditLog(entity).then((r) => active && setRes({ entity, r }));
    return () => {
      active = false;
    };
  }, [entity, auditLog]);

  const r = res && res.entity === entity ? res.r : null;
  const describe = (e: AuditEntry) =>
    Object.entries(e.details)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');

  return (
    <FlatList
      data={r?.ok ? r.data : []}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <ChipGroup testID="audit-entity" value={entity} onChange={(v) => setEntity(v ?? undefined)} allLabel={a.all} options={AUDIT_ENTITIES.map((x) => ({ value: x, label: a.entities[x] }))} />
          {r && !r.ok && <Notice text={r.code === 'not_allowed' ? t.admin.notAdmin : t.loadError} tone="error" />}
        </View>
      }
      ListEmptyComponent={r?.ok ? <Notice text={a.empty} /> : null}
      renderItem={({ item: e }) => (
        <View style={styles.card} testID={`audit-${e.id}`}>
          <View style={styles.row}>
            <Pill label={a.entities[e.entity] ?? e.entity} />
            <Text style={styles.title}>{a.actions[e.action] ?? e.action}</Text>
          </View>
          <Text style={styles.meta}>
            {e.actorName ?? a.system} · {new Date(e.createdAt).toLocaleString(locale === 'ar' ? 'ar-OM' : 'en-GB')}
          </Text>
          {!!describe(e) && <Text style={styles.meta}>{ltr(describe(e))}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: font.body, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 },
  title: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
});
