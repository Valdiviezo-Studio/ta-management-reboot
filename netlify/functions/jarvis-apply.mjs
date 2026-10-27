import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeSubmission } from '../../jarvis-integration/validation.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
async function boundedBody(request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('empty');
  const chunks = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 32768) { await reader.cancel(); throw new Error('large'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export default async function handler(request) {
  if (request.method !== 'POST') return json({ ok: false, reason: 'Nur POST erlaubt.' }, 405);
  const origin = request.headers.get('origin');
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, ...(process.env.TA_JARVIS_ALLOWED_ORIGINS || '').split(',')].filter(Boolean).map(value => { try { return new URL(value.trim()).origin; } catch { return ''; } });
  if (!origin || !allowed.includes(origin) || !request.headers.get('content-type')?.startsWith('application/json')) return json({ ok: false, reason: 'Formularherkunft nicht erlaubt.' }, 403);
  let input;
  try { input = await boundedBody(request); } catch { return json({ ok: false, reason: 'Ungültiges oder zu großes Formular.' }, 400); }
  if (typeof input?.jobSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.jobSlug) || input.jobSlug.length > 100) return json({ ok: false, reason: 'Stelle nicht gefunden.' }, 404);
  let page;
  try { page = JSON.parse(await readFile(join(process.cwd(), 'jarvis-integration', 'jobs', `${input.jobSlug}.json`), 'utf8')); }
  catch { return json({ ok: false, reason: 'Stelle nicht gefunden.' }, 404); }
  if (page.mode !== 'live' || process.env.TA_JARVIS_FORMS_ENABLED !== 'true') return json({ ok: false, reason: 'Diese Vorschau nimmt noch keine echten Bewerbungen entgegen. Bitte den abgestimmten lokalen Test verwenden.' }, 409);
  let payload;
  try { payload = normalizeSubmission(page, input); } catch (error) { return json({ ok: false, reason: error.message }, 400); }
  const endpoint = process.env.TA_LEAD_WEBHOOK_URL, token = process.env.TA_LEAD_WEBHOOK_TOKEN;
  let destination;
  try { destination = new URL(endpoint); } catch { return json({ ok: false, reason: 'Das Kandidatenportal ist noch nicht verbunden.' }, 503); }
  if (destination.protocol !== 'https:' || destination.username || destination.password || destination.hash || !token || token.length < 32) return json({ ok: false, reason: 'Das Kandidatenportal ist noch nicht freigegeben.' }, 503);
  try {
    const response = await fetch(destination, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(9000), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': payload.lead_id }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || result.ok !== true || result.leadId !== payload.lead_id || !/^[0-9a-f-]{36}$/i.test(result.applicationId || '')) throw new Error('not-confirmed');
    return json({ ok: true, leadId: payload.lead_id, applicationId: result.applicationId });
  } catch { return json({ ok: false, reason: 'Die Speicherung wurde nicht bestätigt. Bitte erneut versuchen; dieselbe Anfrage-ID bleibt erhalten.' }, 503); }
}
export const config = { rateLimit: { action: 'rate_limit', aggregateBy: ['ip'], windowLimit: 20, windowSize: 60 } };
