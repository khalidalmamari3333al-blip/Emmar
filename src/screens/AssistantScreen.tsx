import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OmaniArch } from '@/components/omani/OmaniArch';
import { SparkleIcon } from '@/components/omani/icons';
import { PropertyCard } from '@/components/PropertyCard';
import { Button, Notice } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { askAssistant, AssistantResult, ChatTurn } from '@/services/assistant';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { PropertySummary } from '@/types/property';
import { FadeIn } from '@/components/motion';

interface Message extends ChatTurn {
  id: number;
  properties?: PropertySummary[];
  demo?: boolean;
}

export interface AssistantScreenProps {
  ask?: (turns: ChatTurn[], locale: 'ar' | 'en') => Promise<AssistantResult>;
  onOpenProperty?: (id: string) => void;
  onSignIn?: () => void;
}

export function AssistantScreen({ ask = (t, l) => askAssistant(t, l), onOpenProperty = () => {}, onSignIn = () => {} }: AssistantScreenProps) {
  const { t, locale } = useLocale();
  const auth = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const list = useRef<FlatList<Message>>(null);

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || busy) return;
    const userMsg: Message = { id: nextId.current++, role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setError(null);
    setBusy(true);
    const r = await ask(history.map(({ role, content: c }) => ({ role, content: c })), locale);
    setBusy(false);
    if (r.status === 'ok') {
      setMessages((m) => [...m, { id: nextId.current++, role: 'assistant', content: r.reply, properties: r.properties, demo: r.demo }]);
    } else {
      // نعيد الرسالة لحقل الكتابة حتى يعيد المحاولة، ولا نتركها في السجل بلا رد
      setMessages((m) => m.filter((x) => x.id !== userMsg.id));
      setInput(content);
      setError(t.assistant.errors[r.status]);
    }
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  const header = (
    <View style={styles.header}>
      <OmaniArch size={44} fill={colors.primary}>
        <SparkleIcon size={20} color={colors.white} />
      </OmaniArch>
      <Text style={styles.title}>{t.assistant.title}</Text>
      {messages.length > 0 && <Button small variant="ghost" label={t.assistant.newChat} onPress={() => (setMessages([]), setError(null))} />}
    </View>
  );

  if (auth.status === 'not_configured' || auth.status === 'signed_out') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <View style={styles.center}>
          <Notice text={auth.status === 'not_configured' ? t.notConfigured : t.assistant.signInPrompt} />
          {auth.status === 'signed_out' && <Button label={t.bookings.signInCta} onPress={onSignIn} />}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.intro}>
              <Text style={styles.introText}>{t.assistant.intro}</Text>
              {t.assistant.suggestions.map((s) => (
                <Pressable key={s} style={styles.suggestion} onPress={() => send(s)} accessibilityRole="button">
                  <Text style={styles.suggestionText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <FadeIn distance={10} style={{ gap: spacing.sm }}>
              <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.botBubble]} testID={`msg-${item.role}`}>
                <Text style={[styles.bubbleText, item.role === 'user' && { color: colors.white }]}>{item.content}</Text>
                {item.demo && <Text style={styles.demoNote}>{t.demo.assistantNote}</Text>}
              </View>
              {!!item.properties?.length && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: 4 }}>
                  {item.properties.map((p) => (
                    <PropertyCard key={p.id} item={p} onPress={() => onOpenProperty(p.id)} />
                  ))}
                </ScrollView>
              )}
            </FadeIn>
          )}
          ListFooterComponent={
            <>
              {busy && (
                <View style={[styles.bubble, styles.botBubble, styles.thinking]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.thinkingText}>{t.assistant.thinking}</Text>
                </View>
              )}
              {error && <Notice text={error} tone="error" />}
            </>
          }
        />
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t.assistant.placeholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={2000}
            accessibilityLabel={t.assistant.placeholder}
            onSubmitEditing={() => send()}
          />
          <Button label={t.assistant.send} onPress={() => send()} disabled={!input.trim() || busy} small testID="assistant-send" />
        </View>
        <Text style={styles.disclaimer}>{t.assistant.disclaimer}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { flex: 1, fontFamily: fonts.display, fontSize: font.h2, color: colors.text },
  center: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  intro: { gap: spacing.sm, marginTop: spacing.md },
  introText: { fontFamily: fonts.body, fontSize: font.body, color: colors.textMuted, lineHeight: 24 },
  suggestion: { borderWidth: 1, borderColor: colors.sand, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  suggestionText: { color: colors.clay, fontFamily: fonts.bodyMedium, fontSize: font.small },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  botBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: fonts.body, fontSize: font.body, color: colors.text, lineHeight: 23 },
  demoNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 6 },
  thinking: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  thinkingText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.small },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontFamily: fonts.body, fontSize: font.body, color: colors.text, backgroundColor: colors.background },
  disclaimer: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center', paddingVertical: 6, backgroundColor: colors.surface },
});
