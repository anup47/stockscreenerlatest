// Shared local-Ollama helpers for the office-PC scripts.
import { spawn } from 'node:child_process';

// Node on Windows resolves `localhost` to ::1, which Ollama doesn't listen on.
export const OLLAMA = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
  .replace(/\/$/, '').replace('//localhost', '//127.0.0.1');

// Starts `ollama serve` if needed (unattended runs) and checks the model is installed.
export async function ensureOllama(model, log = console.log) {
  const ping = () => fetch(`${OLLAMA}/api/tags`).catch(() => null);
  let res = await ping();
  if (!res?.ok) {
    log('Ollama not running — starting `ollama serve`');
    spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 30 && !res?.ok; i++) { await new Promise(r => setTimeout(r, 1000)); res = await ping(); }
  }
  if (!res?.ok) throw new Error(`Ollama is not reachable at ${OLLAMA} — start the Ollama app and retry.`);
  const { models } = await res.json();
  if (!models.some(m => m.name === model)) throw new Error(`Model ${model} not installed — run: ollama pull ${model}`);
}

// One structured-output chat call. Streams because Node's fetch drops a request whose
// response headers take >5 min, which slow CPU-only runs hit.
export async function chatJson(model, prompt, schema, { numCtx = 4096, timeoutMs = 15 * 60_000 } = {}) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      format: schema,
      options: { temperature: 0, num_ctx: numCtx },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let out = '', buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) if (line.trim()) out += JSON.parse(line).message?.content ?? '';
  }
  if (buf.trim()) out += JSON.parse(buf).message?.content ?? '';
  return JSON.parse(out);
}
