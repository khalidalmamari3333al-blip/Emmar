// نستورد الأوزان المستخدمة فقط حتى لا تُضمَّن كل ملفات الخط في التطبيق
import { ElMessiri_600SemiBold } from '@expo-google-fonts/el-messiri/600SemiBold';
import { ElMessiri_700Bold } from '@expo-google-fonts/el-messiri/700Bold';
import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_500Medium } from '@expo-google-fonts/ibm-plex-sans-arabic/500Medium';
import { IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold';
import { IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppBridge } from '@/components/AppBridge';
import { LocaleProvider } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/theme';

// اللغة واتجاه الكتابة (RTL/LTR) يديرهما LocaleProvider:
// العربية افتراضيًا، أو لغة الجهاز، أو آخر اختيار للمستخدم.
export default function RootLayout() {
  const [loaded, error] = useFonts({
    ElMessiri_600SemiBold,
    ElMessiri_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  // ننتظر الخطوط حتى لا يتغير شكل النص بعد الظهور؛ إن فشل تحميلها نكمل بخط النظام.
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <LocaleProvider>
      <AuthProvider>
        <SafeAreaProvider>
          <AppBridge />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              // انتقال ناعم بين الشاشات (على الهاتف)
              animation: 'fade_from_bottom',
              animationDuration: 280,
            }}
          />
        </SafeAreaProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
