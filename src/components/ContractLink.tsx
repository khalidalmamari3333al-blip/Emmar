import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { useLocale } from '@/i18n';
import { contractForBooking, createContract } from '@/services/contracts';

/** زر العقد لحجز مؤكد: "عرض العقد" إن وُجد، أو "إنشاء العقد" للمالك. */
export function ContractLink({ bookingId, canCreate = false, open = (id: string) => router.push(`/contracts/${id}`) }: { bookingId: string; canCreate?: boolean; open?: (id: string) => void }) {
  const { t } = useLocale();
  const [state, setState] = useState<{ id: string | null; ready: boolean }>({ id: null, ready: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    contractForBooking(bookingId).then((r) => active && setState({ id: r.ok ? r.data : null, ready: r.ok }));
    return () => {
      active = false;
    };
  }, [bookingId]);

  if (!state.ready) return null;
  if (state.id) return <Button small variant="secondary" label={t.contracts.open} onPress={() => open(state.id!)} testID={`contract-open-${bookingId}`} />;
  if (!canCreate) return null;
  return (
    <Button
      small
      label={t.contracts.create}
      busy={busy}
      testID={`contract-create-${bookingId}`}
      onPress={async () => {
        setBusy(true);
        const r = await createContract(bookingId);
        setBusy(false);
        if (r.ok) open(r.data);
      }}
    />
  );
}
