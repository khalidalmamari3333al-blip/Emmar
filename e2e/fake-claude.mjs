// خادم وهمي يحاكي Claude Messages API لاختبار المساعد بدون مفتاح حقيقي.
// السيناريو: يبحث ← يعرض أول نتيجة ← يرد بنص. ويسجل الطلبات للتحقق منها.
import http from 'node:http';

const requests = [];
const reply = (content, stop_reason) => ({
  id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
});

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/__requests') return res.end(JSON.stringify(requests));
      const body = JSON.parse(raw || '{}');
      requests.push({ url: req.url, headers: req.headers, body });
      const last = body.messages.at(-1);
      const result = Array.isArray(last.content) ? last.content.find((b) => b.type === 'tool_result') : null;
      let out;
      if (/refuse-me/.test(JSON.stringify(last.content))) out = reply([], 'refusal');
      else if (!result) out = reply([{ type: 'tool_use', id: 'tu_1', name: 'search_properties', input: { city: 'sohar', kind: 'student', max_price: 60 } }], 'tool_use');
      else if (result.tool_use_id === 'tu_1') {
        const rows = JSON.parse(result.content);
        out = reply([{ type: 'tool_use', id: 'tu_2', name: 'show_properties', input: { property_ids: [...rows.slice(0, 1).map((r) => r.id), '00000000-dead-beef-0000-000000000000'] } }], 'tool_use');
      } else out = reply([{ type: 'text', text: 'وجدت لك سكنًا طلابيًا مناسبًا في صحار.' }], 'end_turn');
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_fake' });
      res.end(JSON.stringify(out));
    });
  })
  .listen(4010, () => console.log('fake claude ready'));
