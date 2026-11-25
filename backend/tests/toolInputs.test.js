import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmailSchema, createEventSchema } from '../tools/schemas.js';
import { buildRawEmail, extractMailBody } from '../tools/mailContent.js';
import { chatInput, approvalInput } from '../utils/chatValidation.js';
import { randomUUID } from 'node:crypto';

test('email schema rejects header injection and the MIME builder preserves UTF-8 body', () => {
  const input = { to: 'user@example.com', cc: ['copy@example.com'], subject: 'Meeting ✓', body: 'Hello नमस्ते\nSecond line' };
  const raw = Buffer.from(buildRawEmail(input), 'base64url').toString('utf8');
  assert.match(raw, /Cc: copy@example.com/);
  assert.equal(Buffer.from(raw.split('\r\n\r\n')[1].replaceAll('\r\n', ''), 'base64').toString('utf8'), input.body);
  for (const bad of [{ cc: ['a@example.com\r\nBcc: victim@example.com'] }, { subject: 'Hello\r\nBcc: victim@example.com' }, { to: 'not an address' }, { cc: 'copy@example.com' }]) assert.equal(sendEmailSchema.safeParse({ ...input, ...bad }).success, false);
});

test('nested multipart extraction prefers text and excludes attachments', () => {
  const part = (mimeType, value) => ({ mimeType, body: { data: Buffer.from(value).toString('base64url') } });
  const payload = { parts: [{ mimeType: 'multipart/alternative', parts: [part('text/html', '<p>HTML</p>'), part('text/plain', 'Plain text')] }, { ...part('text/plain', 'secret attachment'), filename: 'notes.txt' }] };
  assert.equal(extractMailBody(payload), 'Plain text');
  assert.equal(extractMailBody(part('text/html', '<style>x</style><p>Hello &amp; welcome</p>')).trim(), 'Hello & welcome');
});

test('calendar creation requires explicit timezone and increasing valid times', () => {
  const event = { summary: 'Review', startTime: '2026-11-25T10:00:00+05:30', endTime: '2026-11-25T11:00:00+05:30' };
  assert(createEventSchema.safeParse(event).success);
  for (const bad of [{ startTime: '2026-11-25T10:00:00' }, { endTime: event.startTime }, { endTime: 'bad date' }, { attendees: ['not-email'] }]) assert.equal(createEventSchema.safeParse({ ...event, ...bad }).success, false);
});

test('chat validates request identity, message bounds and timezone; approval cannot alter arguments', () => {
  const input = { message: 'hello', conversationId: randomUUID(), requestId: randomUUID(), timeZone: 'Asia/Kolkata' };
  assert(chatInput.safeParse(input).success);
  for (const bad of [{ message: {} }, { message: ' ' }, { message: 'x'.repeat(12001) }, { timeZone: 'Invalid/Zone' }, { agent: 'other-owner-agent' }]) assert.equal(chatInput.safeParse({ ...input, ...bad }).success, false);
  assert.equal(approvalInput.safeParse({ conversationId: input.conversationId, decision: 'approve', args: { to: 'attacker@example.com' } }).success, false);
});
