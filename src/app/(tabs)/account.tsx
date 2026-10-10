import { router } from 'expo-router';

import { AccountScreen } from '@/screens/AccountScreen';

export default function AccountRoute() {
  return <AccountScreen onOpenOwner={() => router.push('/owner')} onOpenAdmin={() => router.push('/admin')} onOpenVerify={() => router.push('/verify')} onOpenContracts={() => router.push('/contracts')} onOpenPayments={() => router.push('/payments')} />;
}
