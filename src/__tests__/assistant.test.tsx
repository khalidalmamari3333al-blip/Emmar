import { fireEvent, render, screen } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { AssistantScreen } from '@/screens/AssistantScreen';
import { askAssistant, AssistantResult, AssistantTransport, ChatTurn, mapAssistantError, trimHistory } from '@/services/assistant';
import { resetDemo } from '@/demo/store';
import { fakeAuthBackend, STUDENT } from '@/test-utils/fakeAuth';

const t = dictionaries.ar;
const LIVE = { useMockData: false, supabaseUrl: 'u', supabaseAnonKey: 'k' };
const row = {
  id: 'p1', kind: 'student' as const, type: 'student_housing' as const, city: 'sohar' as const, district_ar: 'الهمبار', district_en: 'Al Humbar',
  title_ar: 'سكن النخيل', title_en: 'Al Nakheel', price_omr: '45', price_period: 'monthly' as const, bedrooms: null, area_sqm: null, cover_image_path: null, featured: false,
};

describe('assistant service', () => {
  it('in demo mode answers from simple rules and says so', async () => {
    resetDemo();
    const r = await askAssistant([{ role: 'user', content: 'سرير في سكن طلابي بصحار بأقل من 60' }], 'ar', { useMockData: true });
    expect(r.status === 'ok' && r.demo).toBe(true);
    expect(r.status === 'ok' && r.properties.every((p) => p.kind === 'student' && p.city === 'sohar' && p.priceOmr <= 60)).toBe(true);
  });

  it('maps server replies and property rows', async () => {
    const transport: AssistantTransport = { invoke: jest.fn(async () => ({ status: 200, data: { reply: 'تفضل', properties: [row] } })) };
    const r = await askAssistant([{ role: 'user', content: 'سكن' }], 'ar', LIVE, transport);
    expect(r.status === 'ok' && r.properties[0].title).toEqual({ ar: 'سكن النخيل', en: 'Al Nakheel' });
    expect(transport.invoke).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'سكن' }], locale: 'ar' });
  });

  it('maps HTTP errors to clear messages', () => {
    expect(mapAssistantError(401, 'sign_in_required')).toBe('sign_in');
    expect(mapAssistantError(429, 'daily_limit')).toBe('daily_limit');
    expect(mapAssistantError(503, 'not_configured')).toBe('not_configured');
    expect(mapAssistantError(503, 'busy')).toBe('busy');
    expect(mapAssistantError(undefined, undefined)).toBe('error');
  });

  it('trims long history so it still starts with the user', () => {
    const turns = Array.from({ length: 25 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: String(i) }));
    const out = trimHistory(turns);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0].role).toBe('user');
    expect(out.at(-1)!.content).toBe('24');
  });
});

describe('AssistantScreen', () => {
  const wrap = (ask: (turns: ChatTurn[], locale: 'ar' | 'en') => Promise<AssistantResult>, auth: AuthBackend | 'demo' = fakeAuthBackend(STUDENT), onOpenProperty = jest.fn()) =>
    render(
      <LocaleProvider initialLocale="ar">
        <AuthProvider backend={auth}>
          <AssistantScreen ask={ask} onOpenProperty={onOpenProperty} />
        </AuthProvider>
      </LocaleProvider>,
    );

  it('sends a suggestion, shows the reply and property cards', async () => {
    const ask = jest.fn(async () => ({ status: 'ok' as const, reply: 'وجدت لك سكنًا مناسبًا.', properties: [{ id: 'p1', title: { ar: 'سكن النخيل', en: 'N' }, district: { ar: 'الهمبار', en: 'H' }, city: 'sohar' as const, kind: 'student' as const, type: 'student_housing' as const, priceOmr: 45, pricePeriod: 'monthly' as const, featured: false }] }));
    const onOpen = jest.fn();
    await wrap(ask, fakeAuthBackend(STUDENT), onOpen);
    await fireEvent.press(await screen.findByText(t.assistant.suggestions[0]));
    expect(ask).toHaveBeenCalledWith([{ role: 'user', content: t.assistant.suggestions[0] }], 'ar');
    expect(await screen.findByText('وجدت لك سكنًا مناسبًا.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('property-p1'));
    expect(onOpen).toHaveBeenCalledWith('p1');
  });

  it('sends the whole conversation on follow-up questions', async () => {
    const ask = jest.fn(async () => ({ status: 'ok' as const, reply: 'رد', properties: [] }));
    await wrap(ask);
    await fireEvent.changeText(await screen.findByLabelText(t.assistant.placeholder), 'سؤال 1');
    await fireEvent.press(screen.getByTestId('assistant-send'));
    await screen.findByText('رد');
    await fireEvent.changeText(screen.getByLabelText(t.assistant.placeholder), 'سؤال 2');
    await fireEvent.press(screen.getByTestId('assistant-send'));
    expect(ask).toHaveBeenLastCalledWith(
      [{ role: 'user', content: 'سؤال 1' }, { role: 'assistant', content: 'رد' }, { role: 'user', content: 'سؤال 2' }],
      'ar',
    );
  });

  it('shows the daily-limit error and restores the text for retry', async () => {
    await wrap(async () => ({ status: 'daily_limit' }));
    await fireEvent.changeText(await screen.findByLabelText(t.assistant.placeholder), 'مرحبا');
    await fireEvent.press(screen.getByTestId('assistant-send'));
    expect(await screen.findByText(t.assistant.errors.daily_limit)).toBeTruthy();
    expect(screen.getByDisplayValue('مرحبا')).toBeTruthy();
    expect(screen.queryByTestId('msg-user')).toBeNull();
  });

  it('asks signed-out users to sign in, and is honest in demo mode', async () => {
    await wrap(async () => ({ status: 'error' }), fakeAuthBackend(null));
    expect(await screen.findByText(t.assistant.signInPrompt)).toBeTruthy();
  });

  it('labels demo replies as rule-based, not AI', async () => {
    await wrap(async () => ({ status: 'ok', reply: 'رد', properties: [], demo: true }));
    await fireEvent.changeText(await screen.findByLabelText(t.assistant.placeholder), 'مرحبا');
    await fireEvent.press(screen.getByTestId('assistant-send'));
    expect(await screen.findByText(t.demo.assistantNote)).toBeTruthy();
  });
});
