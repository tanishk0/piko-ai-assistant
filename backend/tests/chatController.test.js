import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import z from 'zod';
import { AIMessage } from '@langchain/core/messages';
import { createChatHandlers } from '../controllers/chat.controller.js';

// Exercise orchestration with deterministic repositories; no live accounts or model calls.
function repository(defaults = {}) {
  const records = new Map();
  const copy = value => value == null ? value : structuredClone(value);
  const matches = (record, filter) => Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$gt' in value ? record[key] > value.$gt : record[key] === value || (value === null && record[key] == null));
  function apply(record, update) {
    Object.assign(record, copy(update.$set || {}));
    for (const [key, value] of Object.entries(update.$push || {})) (record[key] ||= []).push(...copy(value.$each || [value]));
  }
  return {
    records,
    async create(input) { const record = { ...copy(defaults), ...copy(input), _id: input._id || randomBytes(12).toString('hex') }; if (records.has(record._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); records.set(record._id, record); return copy(record); },
    async findOne(filter) { return copy([...records.values()].find(r => matches(r, filter)) || null); },
    async findById(id) { return copy(records.get(id)); },
    async find(filter) { return copy([...records.values()].filter(r => matches(r, filter))); },
    async findOneAndUpdate(filter, update, options = {}) {
      let record = [...records.values()].find(r => matches(r, filter));
      if (!record && options.upsert) return this.create({ ...filter, ...update.$setOnInsert, ...update.$set });
      if (!record) return null;
      apply(record, update); return copy(record);
    },
    async updateOne(filter, update) { const record = [...records.values()].find(r => matches(r, filter)); if (!record) return { modifiedCount: 0 }; apply(record, update); return { modifiedCount: 1 }; },
    async updateMany(filter, update) { for (const record of records.values()) if (matches(record, filter)) apply(record, update); },
  };
}

const agentId = '123456789012345678901234';
async function harness({ balance = 100, invoke, provider } = {}) {
  const Agent = repository();
  const Conversation = repository({ agentId: null, activeRunId: null, messages: [] });
  const ChatRun = repository({ status: 'running' });
  const PendingAction = repository({ status: 'pending' });
  await Agent.create({ _id: agentId, userId: 'owner', isActive: true, name: 'Assistant', tools: ['gmail_send'] });
  const state = { balance, debits: 0, refunds: 0, graphCalls: 0, writes: 0, events: [], reservations: new Map() };
  const graph = { async invoke(input) { state.graphCalls++; state.events.push('graph'); return invoke ? invoke(input) : { messages: [new AIMessage('Done')] }; }, async updateState() {} };
  const tool = { name: 'gmail_send', schema: z.object({ to: z.string().email() }), async invoke(args) { state.writes++; return provider ? provider(args) : { messageId: 'sent1' }; } };
  const deps = {
    Agent, Conversation, ChatRun, PendingAction,
    createChatGraph: () => graph, createAgentGraph: async () => graph, createTools: async () => [tool],
    deductCredits: async ({ credits, reservationId }) => { if (state.balance < credits) throw Object.assign(new Error('Insufficient credits'), { status: 402 }); state.events.push('debit'); state.debits++; state.balance -= credits; state.reservations.set(reservationId, credits); },
    refundCredits: async ({ reservationId }) => { if (state.reservations.has(reservationId)) { state.balance += state.reservations.get(reservationId); state.refunds++; state.reservations.delete(reservationId); } },
    settleCredits: async ({ reservationId }) => state.reservations.delete(reservationId),
  };
  return { ...deps, state, handlers: createChatHandlers(deps) };
}
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function request(overrides = {}) { return { user: { _id: 'owner' }, body: { message: 'hello', conversationId: randomUUID(), requestId: randomUUID(), timeZone: 'Asia/Kolkata' }, ...overrides }; }

test('agent chat cannot fall back to another owner or execute inactive agents', async () => {
  const h = await harness();
  const req = request({ user: { _id: 'intruder' } }); req.body.agentId = agentId;
  const res = response(); await h.handlers.agentChat(req, res);
  assert.equal(res.statusCode, 404); assert.equal(h.state.debits, 0); assert.equal(h.state.graphCalls, 0);
  h.Agent.records.get(agentId).isActive = false;
  const inactive = request(); inactive.body.agentId = agentId;
  const second = response(); await h.handlers.agentChat(inactive, second); assert.equal(second.statusCode, 404);
});

test('insufficient credits stop work before any model invocation', async () => {
  const h = await harness({ balance: 0 }); const res = response();
  await h.handlers.chat(request(), res);
  assert.equal(res.statusCode, 402); assert.equal(h.state.graphCalls, 0); assert.equal(h.state.balance, 0);
});

test('debit precedes execution and replay returns the stored response without another debit', async () => {
  const h = await harness(); const req = request(); const first = response();
  await h.handlers.chat(req, first);
  assert.equal(first.statusCode, 200); assert.deepEqual(h.state.events, ['debit', 'graph']);
  const second = response(); await h.handlers.chat(req, second);
  assert.deepEqual(second.body, first.body); assert.equal(h.state.graphCalls, 1); assert.equal(h.state.debits, 1);
  const changed = response(); await h.handlers.chat({ ...req, body: { ...req.body, message: 'different' } }, changed);
  assert.equal(changed.statusCode, 409); assert.equal(h.state.debits, 1);
});

test('overlapping turns cannot execute against the same conversation', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  let entered; const started = new Promise(resolve => { entered = resolve; });
  const h = await harness({ invoke: async () => { entered(); await wait; return { messages: [new AIMessage('Done')] }; } });
  const first = request(); const running = h.handlers.chat(first, response()); await started;
  const second = request(); second.body.conversationId = first.body.conversationId;
  const res = response(); await h.handlers.chat(second, res);
  assert.equal(res.statusCode, 409); assert.equal(h.state.graphCalls, 1); assert.equal(h.state.debits, 1);
  release(); await running;
});

test('failed runs refund once and revoke proposals, including on replay', async () => {
  const h = await harness({ invoke: async () => { throw new Error('model timeout'); } });
  const req = request(); const runId = `owner:${req.body.requestId}`;
  await h.PendingAction.create({ runId, toolCallId: 'call', conversationId: req.body.conversationId });
  const first = response(); await h.handlers.chat(req, first);
  assert.equal(first.statusCode, 500); assert.equal(h.state.balance, 100); assert.equal(h.state.refunds, 1);
  assert.equal((await h.PendingAction.find({ runId }))[0].status, 'rejected');
  await h.handlers.chat(req, response()); assert.equal(h.state.refunds, 1); assert.equal(h.state.graphCalls, 1);
});

async function pending(h, overrides = {}) {
  const conversation = await h.Conversation.create({ _id: randomUUID(), userId: 'owner', agentId, timeZone: 'UTC' });
  const action = await h.PendingAction.create({ userId: 'owner', agentId, conversationId: conversation._id, runId: 'run1', toolCallId: 'call1', tool: 'gmail_send', args: { to: 'recipient@example.com' }, expiresAt: new Date(Date.now() + 60000), ...overrides });
  const req = { user: { _id: 'owner' }, params: { id: action._id }, body: { conversationId: conversation._id, decision: 'approve' } };
  return { action, req };
}

test('approval executes stored payload once and replay returns the saved receipt', async () => {
  let delivered;
  const h = await harness({ provider: async args => { delivered = args; return { messageId: 'sent1' }; } });
  const { req } = await pending(h);
  const first = response(); await h.handlers.decideAction(req, first);
  assert.equal(first.statusCode, 200); assert.equal(first.body.action.status, 'succeeded');
  assert.deepEqual(delivered, { to: 'recipient@example.com' });
  const replay = response(); await h.handlers.decideAction(req, replay);
  assert.equal(replay.body.action.status, 'succeeded'); assert.equal(h.state.writes, 1);
});

test('approval is bound to its owner, conversation and immutable payload', async () => {
  const h = await harness(); const { req } = await pending(h);
  for (const bad of [{ ...req, user: { _id: 'intruder' } }, { ...req, body: { ...req.body, conversationId: randomUUID() } }, { ...req, body: { ...req.body, args: { to: 'attacker@example.com' } } }]) {
    const res = response(); await h.handlers.decideAction(bad, res); assert([400, 404].includes(res.statusCode));
  }
  assert.equal(h.state.writes, 0);
});

test('expired and rejected actions cannot execute', async () => {
  const h = await harness(); const expired = await pending(h, { expiresAt: new Date(0) });
  const res = response(); await h.handlers.decideAction(expired.req, res); assert.equal(res.statusCode, 409);
  const rejected = await pending(h); rejected.req.body.decision = 'reject';
  await h.handlers.decideAction(rejected.req, response()); rejected.req.body.decision = 'approve';
  const replay = response(); await h.handlers.decideAction(rejected.req, replay);
  assert.equal(replay.body.action.status, 'rejected'); assert.equal(h.state.writes, 0);
});

test('revoked agent tool permission is rechecked at approval time', async () => {
  const h = await harness(); const { req } = await pending(h);
  const handlers = createChatHandlers({ ...h, createTools: async agent => agent.tools.length ? [assert.fail('Tool should not be constructed')] : [] });
  h.Agent.records.get(agentId).tools = [];
  const res = response(); await handlers.decideAction(req, res);
  assert.equal(res.statusCode, 403); assert.equal(h.state.writes, 0);
});

test('ambiguous provider failure is recorded and retries cannot repeat the write', async () => {
  const h = await harness({ provider: async () => { throw new Error('Connection lost after send'); } });
  const { req } = await pending(h); const first = response(); await h.handlers.decideAction(req, first);
  assert.equal(first.body.action.status, 'unknown');
  await h.handlers.decideAction(req, response()); assert.equal(h.state.writes, 1);
});

test('receipt persistence failure leaves the action claimed rather than repeating the provider call', async () => {
  const h = await harness(); const { req } = await pending(h);
  const update = h.PendingAction.updateOne;
  h.PendingAction.updateOne = async (filter, change) => { if (change.$set?.status === 'succeeded') throw new Error('database unavailable'); return update.call(h.PendingAction, filter, change); };
  const first = response(); await h.handlers.decideAction(req, first); assert.equal(first.statusCode, 500);
  const replay = response(); await h.handlers.decideAction(req, replay);
  assert.equal(replay.body.action.status, 'executing'); assert.equal(h.state.writes, 1);
});

test('history cannot expose another owner conversation', async () => {
  const h = await harness(); const { req } = await pending(h);
  const res = response(); await h.handlers.getHistory({ user: { _id: 'intruder' }, params: { id: req.body.conversationId } }, res);
  assert.equal(res.statusCode, 404);
});
