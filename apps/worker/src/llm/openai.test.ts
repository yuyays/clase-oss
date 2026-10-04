import assert from 'node:assert/strict';
import test from 'node:test';

void test('deletes an uploaded provider file when parsing fails', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DATABASE_URL = 'postgres://dummy:dummy@localhost:5432/dummy';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.SUPABASE_STORAGE_BUCKET = 'test-bucket';
  const { parseWithOpenAiFileDetailed } = await import('./openai.js');
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    requests.push({ url, method });

    if (url.endsWith('/files') && method === 'POST') {
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('expires_after[seconds]'), '86400');
      return new Response(JSON.stringify({ id: 'file-test' }), { status: 200 });
    }
    if (url.endsWith('/responses') && method === 'POST') {
      if (typeof init?.body !== 'string') {
        throw new Error('response request body must be JSON');
      }
      assert.equal(JSON.parse(init.body).store, false);
      return new Response('provider error', { status: 500 });
    }
    if (url.endsWith('/files/file-test') && method === 'DELETE') {
      return new Response(JSON.stringify({ id: 'file-test', deleted: true }), { status: 200 });
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  };

  try {
    await assert.rejects(
      parseWithOpenAiFileDetailed({
        fileBuffer: Buffer.from('%PDF-1.4'),
        fileName: 'sample.pdf',
        mimeType: 'application/pdf',
        model: 'test-model',
      }),
      /OpenAI request failed: 500/,
    );
    assert.deepEqual(
      requests.map(({ method }) => method),
      ['POST', 'POST', 'DELETE'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
