import { ComingSoon } from '@/components/ComingSoon';
import { useT } from '@/i18n';

export default function Screen() {
  const t = useT();
  return <ComingSoon title={t.tabs.bookings} />;
}
