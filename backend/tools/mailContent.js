import { sendEmailSchema } from './schemas.js';

export function buildRawEmail(input) {
  const { to, cc, subject, body } = sendEmailSchema.parse(input);
  const body64 = Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
  // Fold encoded words so long UTF-8 subjects remain valid MIME headers.
  const chunks = [];
  let chunk = '';
  for (const character of subject) {
    if (Buffer.byteLength(chunk + character) > 30) { chunks.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  const encodedSubject = chunks.map(c => `=?UTF-8?B?${Buffer.from(c).toString('base64')}?=`).join('\r\n ');
  return Buffer.from([
    `To: ${to}`, ...(cc?.length ? [`Cc: ${cc.join(',\r\n ')}`] : []),
    `Subject: ${encodedSubject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', body64,
  ].join('\r\n')).toString('base64url');
}

export function extractMailBody(payload) {
  const plain = [];
  const html = [];
  function visit(part) {
    if (!part || part.filename) return;
    if (part.body?.data) {
      const text = Buffer.from(part.body.data, 'base64url').toString('utf8');
      if (part.mimeType === 'text/plain') plain.push(text);
      else if (part.mimeType === 'text/html') html.push(text);
    }
    for (const child of part.parts || []) visit(child);
  }
  visit(payload);
  if (plain.length) return plain.join('\n');
  return html.join('\n').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
