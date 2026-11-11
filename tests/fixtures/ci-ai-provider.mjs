// CI-only protocol fixture. It copies synthetic source text; it performs no model inference.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createCiAiProvider() {
  return createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
    if (request.method === 'GET' && request.url === '/health') return send(200, { fixture: 'synthetic-only' });
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') return send(404, { error: 'fixture_route_not_found' });
    if (request.headers.authorization !== 'Bearer ci-synthetic-provider-only') return send(401, { error: 'fixture_key_required' });
    try {
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 32000) return send(413, { error: 'fixture_request_too_large' }); }
      const payload = JSON.parse(body);
      const source = JSON.parse(payload.messages.find(message => message.role === 'user').content);
      if (source.inputType !== '财务报表' || source.source.trim() !== '隔离发布验收原件。请经办人补齐本季度财务资料，负责人和期限待人工确认。') return send(422, { error: 'only_release_synthetic_source_allowed' });
      send(200, { choices: [{ message: { content: JSON.stringify({ summary: 'CI synthetic provider fixture; source copied without model inference: ' + source.source, extracted: [source.source], generatedTasks: [] }) } }] });
    } catch { send(400, { error: 'invalid_fixture_request' }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createCiAiProvider();
  server.listen(18799, process.env.CI_AI_FIXTURE_HOST ?? '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
