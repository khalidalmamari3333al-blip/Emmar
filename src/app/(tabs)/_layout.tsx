import { Tabs } from 'expo-router';

import { BedIcon, HouseIcon, KeyIcon, SearchIcon } from '@/components/omani/icons';
import { useT } from '@/i18n';
import { colors } from '@/theme';

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabs.home, tabBarIcon: ({ color }) => <HouseIcon size={22} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: t.tabs.search, tabBarIcon: ({ color }) => <SearchIcon size={22} color={color} /> }} />
      <Tabs.Screen name="bookings" options={{ title: t.tabs.bookings, tabBarIcon: ({ color }) => <BedIcon size={22} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: t.tabs.account, tabBarIcon: ({ color }) => <KeyIcon size={22} color={color} /> }} />
    </Tabs>
  );
}
