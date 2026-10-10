// وكيل محلي بسيط يحاكي بوابة Supabase (Kong): /auth/v1 → GoTrue، /rest/v1 → PostgREST.
// للاختبار المحلي فقط.
import http from 'node:http';

const routes = [
  ['/auth/v1', 'http://localhost:59999'],
  ['/rest/v1', 'http://localhost:53000'],
  ['/functions/v1/assistant', 'http://localhost:8000'],
  ['/functions/v1/payments', 'http://localhost:8001'],
];

http
  .createServer((req, res) => {
    // CORS كما تفعل بوابة Supabase، حتى يعمل تطبيق الويب من المتصفح.
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, x-supabase-api-version, x-aqari-signature');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'content-range, x-total-count');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const route = routes.find(([p]) => req.url.startsWith(p));
    if (!route) return res.writeHead(404).end();
    const target = new URL(req.url.slice(route[0].length) || '/', route[1]);
    const proxied = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
      const headers = Object.fromEntries(Object.entries(r.headers).filter(([k]) => !k.startsWith('access-control-')));
      res.writeHead(r.statusCode, headers);
      r.pipe(res);
    });
    proxied.on('error', (e) => res.writeHead(502).end(String(e)));
    req.pipe(proxied);
  })
  .listen(Number(process.env.PORT ?? 54321), () => console.log('proxy ready'));
