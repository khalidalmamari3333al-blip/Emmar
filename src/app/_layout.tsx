import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocaleProvider } from '@/i18n';
import { colors } from '@/theme';

// اللغة واتجاه الكتابة (RTL/LTR) يديرهما LocaleProvider:
// العربية افتراضيًا، أو لغة الجهاز، أو آخر اختيار للمستخدم.
export default function RootLayout() {
  return (
    <LocaleProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </SafeAreaProvider>
    </LocaleProvider>
  );
}
