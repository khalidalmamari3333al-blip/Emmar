import { router, useLocalSearchParams } from 'expo-router';

import { SearchScreen } from '@/screens/SearchScreen';
import type { ListingKind, SearchFilters } from '@/types/property';

const KINDS: ListingKind[] = ['rent', 'sale', 'student'];

export default function SearchRoute() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const initial: SearchFilters = KINDS.includes(kind as ListingKind) ? { kind: kind as ListingKind } : {};
  // key: فتح البحث من فئة مختلفة يبدأ بفلاتر جديدة.
  return <SearchScreen key={kind ?? 'all'} initialFilters={initial} onOpen={(id) => router.push(`/property/${id}`)} />;
}
