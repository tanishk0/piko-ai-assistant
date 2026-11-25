import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySaver } from '@langchain/langgraph';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import z from 'zod';
import { buildContext } from '../utils/graphContext.js';
import { calculate } from '../utils/calculator.js';
import { executeToolCalls, TOOL_BUDGET } from '../utils/toolExecutor.js';
import { allowedToolNames } from '../utils/toolPolicy.js';
import { createAgentGraph } from '../utils/agentGraph.js';
import { createChatGraph } from '../utils/chatGraph.js';

test('calculator preserves scientific notation and arithmetic semantics and rejects invalid input', () => {
  for (const [input, expected] of [['2^3', 8], ['1e3 + 2', 1002], ['(1200 / 4) + 50', 350], ['2^3^2', 512], ['-2^2', -4], ['2^-2', .25]]) assert.equal(calculate(input), expected);
  for (const input of ['1/0', '2foo+3', '1;process.exit()', '', '2(3)', '1e999', '()']) assert.throws(() => calculate(input));
});

test('context selection never separates assistant calls and their tool results', () => {
  const history = [new HumanMessage('first'), new AIMessage({ content: '', tool_calls: [{ name: 'search', args: {}, id: 'call1', type: 'tool_call' }] }), new ToolMessage({ content: 'result', tool_call_id: 'call1' })];
  for (let i = 0; i < 12; i++) history.push(new HumanMessage(`question ${i}`), new AIMessage('a'.repeat(200)));
  const context = buildContext(history, { maxBytes: 3000 });
  assert.equal(context[0].getType(), 'human');
  for (const tool of context.filter(m => m.getType() === 'tool')) assert(context.some(m => m.tool_calls?.some(c => c.id === tool.tool_call_id)));
  assert(context.includes(history.at(-1)));
  assert.throws(() => buildContext([new HumanMessage('x'.repeat(4000))], { maxBytes: 1000 }), /budget/);
});

test('registry policy intersects explicit permissions, service connection and granted scopes', () => {
  const integration = { provider: 'google', status: 'connected', services: ['gmail'], scopes: ['https://www.googleapis.com/auth/gmail.readonly'] };
  const agent = { tools: ['calculator', 'gmail_read', 'gmail_send', 'calendar_create_event', 'unknown'] };
  assert.deepEqual(allowedToolNames(agent, [integration]), ['calculator', 'gmail_read']);
  assert.deepEqual(allowedToolNames({ tools: [] }, [integration]), []);
  assert.deepEqual(allowedToolNames(agent, []), ['calculator']);
});

const call = (id, name = 'read') => ({ id, name, args: {}, type: 'tool_call' });
const readTool = fn => new DynamicStructuredTool({ name: 'read', description: 'Read', schema: z.object({}), func: fn });

test('budgets are enforced before execution and every emitted call receives a result', async () => {
  let executions = 0;
  const result = await executeToolCalls({ calls: [call('a'), call('b'), call('c'), call('d')], tools: [readTool(async () => ++executions)], used: TOOL_BUDGET - 1 });
  assert.equal(executions, 1);
  assert.equal(result.messages.length, 4);
  assert.equal(result.messages[1].status, 'error');
  assert.equal(JSON.parse(result.messages[1].content).error.code, 'BUDGET_EXHAUSTED');
});

test('search limit and step limit are independent of the total call budget', async () => {
  let searches = 0;
  const search = new DynamicStructuredTool({ name: 'web_search', description: 'Search', schema: z.object({}), func: async () => ++searches });
  const result = await executeToolCalls({ calls: [call('a', 'web_search'), call('b', 'web_search'), call('c', 'web_search'), call('d', 'web_search')], tools: [search], searches: 2 });
  assert.equal(searches, 1);
  assert.equal(result.searchExecutions, 1);
  assert.equal(result.messages.length, 4);
});

test('write calls create validated proposals and cannot execute provider functions', async () => {
  let writes = 0;
  let proposed;
  const tool = new DynamicStructuredTool({ name: 'gmail_send', description: 'Send', schema: z.object({ to: z.string().email() }), func: async () => ++writes });
  const result = await executeToolCalls({ calls: [{ ...call('send', 'gmail_send'), args: { to: 'user@example.com' } }], tools: [tool], propose: async (name, args, id) => { proposed = { name, args, id }; return { id: 'action1' }; } });
  assert.equal(writes, 0);
  assert.equal(proposed.args.to, 'user@example.com');
  assert.equal(JSON.parse(result.messages[0].content).status, 'awaiting_approval');
  const invalid = await executeToolCalls({ calls: [call('bad', 'gmail_send')], tools: [tool], propose: async () => assert.fail('Invalid arguments must not be proposed') });
  assert.equal(invalid.messages[0].status, 'error');
});

test('provider exceptions are error messages and output truncation is explicit', async () => {
  const failed = await executeToolCalls({ calls: [call('error')], tools: [readTool(async () => { throw new Error('Provider unavailable'); })] });
  assert.equal(failed.messages[0].status, 'error');
  assert.match(failed.messages[0].content, /Provider unavailable/);
  const large = await executeToolCalls({ calls: [call('big')], tools: [readTool(async () => 'x'.repeat(10000))] });
  assert.equal(JSON.parse(large.messages[0].content).truncated, true);
});

test('cancellation prevents any further tool executions or proposals', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await executeToolCalls({ calls: [call('cancelled')], tools: [readTool(async () => assert.fail('Cancelled tool must not execute'))], config: { signal: controller.signal } });
  assert.equal(result.executions, 0);
  assert.equal(result.messages[0].status, 'error');
});

test('an uncooperative model cannot keep the graph executing after the hard budget', async () => {
  let invocations = 0;
  const llm = { bindTools() { return this; }, async invoke() { return new AIMessage({ content: '', tool_calls: [call(`again${++invocations}`)] }); } };
  const graph = await createAgentGraph({ name: 'Test', instructions: '' }, 'user', { llm, checkpointer: new MemorySaver(), tools: [readTool(async () => 'result')] });
  const result = await graph.invoke({ messages: [new HumanMessage('do work')], modelSteps: 0, toolExecutions: 0, searches: 0 }, { configurable: { thread_id: 'bounded-loop' }, recursionLimit: 16 });
  assert.equal(invocations, 6);
  assert.equal(result.toolExecutions, 5);
  assert.match(result.messages.at(-1).content, /execution limit/);
});

test('real agent graph proposes writes, retains protocol history and resets budgets for a new turn', async () => {
  let step = 0;
  let writes = 0;
  const llm = { bindTools() { return this; }, async invoke(messages) {
    assert(messages[0].content.includes('Asia/Kolkata'));
    step++;
    return step % 2 ? new AIMessage({ content: '', tool_calls: [call(`tool${step}`, 'gmail_send')] }) : new AIMessage('Awaiting approval');
  } };
  const graph = await createAgentGraph({ name: 'Test', instructions: '' }, 'user', { llm, checkpointer: new MemorySaver(), timeZone: 'Asia/Kolkata', tools: [new DynamicStructuredTool({ name: 'gmail_send', description: 'Send', schema: z.object({}), func: async () => ++writes })], propose: async () => ({ id: 'action1' }) });
  const config = { configurable: { thread_id: 'agent-test' } };
  for (let i = 0; i < 2; i++) {
    const result = await graph.invoke({ messages: [new HumanMessage('send')], modelSteps: 0, searches: 0, toolExecutions: 0 }, config);
    assert.equal(result.toolExecutions, 1);
    assert.equal(result.messages.at(-1).content, 'Awaiting approval');
  }
  assert.equal(writes, 0);
});

test('default chat compacts old history while preserving current requirements across checkpoints', async () => {
  let summaries = 0;
  const llm = { async invoke(messages) {
    if (messages[0].content.startsWith('Summarize')) { summaries++; return new AIMessage('User prefers vegetarian meals.'); }
    if (summaries) assert(messages.some(m => m.content.includes('vegetarian')));
    return new AIMessage('Answer');
  } };
  const graph = createChatGraph({ llm, checkpointer: new MemorySaver() });
  let result;
  for (let i = 0; i < 20; i++) result = await graph.invoke({ messages: [new HumanMessage(i ? 'follow-up' : 'vegetarian meals')] }, { configurable: { thread_id: 'chat-test' } });
  assert(summaries > 0);
  assert(result.messages.length < 36);
  assert.equal(result.summary, 'User prefers vegetarian meals.');
});
