import { router, useLocalSearchParams } from 'expo-router';

import { ContractScreen } from '@/screens/contracts/ContractScreen';

export default function ContractRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContractScreen key={id} id={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/contracts'))} />;
}
