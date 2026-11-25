import { ToolMessage } from '@langchain/core/messages';
import { WRITE_TOOLS, toolError } from './toolPolicy.js';

export const TOOL_BUDGET = 8;
export const SEARCH_BUDGET = 3;
export const STEP_BUDGET = 3;

export async function executeToolCalls({ calls, tools, used = 0, searches = 0, propose, config }) {
  const messages = [];
  let executions = 0;
  let searchExecutions = 0;
  for (const [index, call] of calls.entries()) {
    let result;
    try {
      config?.signal?.throwIfAborted();
      const tool = tools.find(t => t.name === call.name);
      if (!tool) throw new Error('Tool is unavailable or not permitted.');
      if (index >= STEP_BUDGET || used + executions >= TOOL_BUDGET || (call.name === 'web_search' && searches + searchExecutions >= SEARCH_BUDGET)) {
        result = { ok: false, error: { code: 'BUDGET_EXHAUSTED', message: 'Tool budget exhausted. Report unfinished work.', retryable: false } };
      } else {
        executions++;
        if (call.name === 'web_search') searchExecutions++;
        const args = await tool.schema.parseAsync(call.args);
        if (WRITE_TOOLS.has(call.name)) {
          const action = await propose(call.name, args, call.id);
          result = { ok: true, status: 'awaiting_approval', action: { id: action.id, tool: call.name, expiresAt: action.expiresAt } };
        } else {
          const data = await tool.invoke(args, config);
          const serialized = typeof data === 'string' ? data : JSON.stringify(data);
          result = { ok: true, data: Buffer.byteLength(serialized) <= 5000 ? data : serialized.slice(0, 2000), ...(Buffer.byteLength(serialized) > 5000 ? { truncated: true, continuation: 'Request a smaller page or body limit to inspect the remainder.' } : {}) };
        }
      }
    } catch (error) { result = toolError(error); }
    messages.push(new ToolMessage({ name: call.name, tool_call_id: call.id, status: result.ok ? 'success' : 'error', content: JSON.stringify(result) }));
  }
  return { messages, executions, searchExecutions };
}
