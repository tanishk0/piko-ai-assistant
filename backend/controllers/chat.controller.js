import { createHash } from 'node:crypto';
import AgentModel from '../models/agent.model.js';
import ConversationModel from '../models/conversation.model.js';
import ChatRunModel from '../models/chatRun.model.js';
import PendingActionModel from '../models/pendingAction.model.js';
import { createAgentGraph as defaultCreateAgentGraph } from '../utils/agentGraph.js';
import { createChatGraph as defaultCreateChatGraph } from '../utils/chatGraph.js';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { deductCredits as defaultDeductCredits, refundCredits as defaultRefundCredits, settleCredits as defaultSettleCredits } from '../utils/deductCredits.js';
import { chatInput, approvalInput } from '../utils/chatValidation.js';
import { createTools as defaultCreateTools } from '../tools/registry.js';
import { executeApprovedAction } from '../utils/actionExecution.js';
import { WRITE_TOOLS } from '../utils/toolPolicy.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const publicAction = action => ({ id: action._id.toString(), tool: action.tool, args: action.args, status: action.status, expiresAt: action.expiresAt, result: action.result, progress: action.progress });
const threadId = conversation => `conversation:${conversation.userId}:${conversation._id}`;
const graphConfig = conversation => ({ configurable: { thread_id: threadId(conversation), timeZone: conversation.timeZone }, recursionLimit: 16, signal: AbortSignal.timeout(90000) });
const readable = content => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n') : content ? JSON.stringify(content) : '';
const sendError = (res, error) => res.status(error.name === 'ZodError' ? 400 : error.status || 500).json({ message: error.name === 'ZodError' ? 'Invalid request parameters.' : error.status ? error.message : 'The request failed. Check conversation history before retrying.' });

export function createChatHandlers(overrides = {}) {
  const { Agent, Conversation, ChatRun, PendingAction, createAgentGraph, createChatGraph, createTools, deductCredits, refundCredits, settleCredits } = {
    Agent: AgentModel, Conversation: ConversationModel, ChatRun: ChatRunModel, PendingAction: PendingActionModel,
    createAgentGraph: defaultCreateAgentGraph, createChatGraph: defaultCreateChatGraph, createTools: defaultCreateTools,
    deductCredits: defaultDeductCredits, refundCredits: defaultRefundCredits, settleCredits: defaultSettleCredits,
    ...overrides,
  };
  async function handleChat(req, res, agentMode) {
    const startedAt = Date.now();
    let run;
    let conversation;
    let credits = 0;
    let locked = false;
    try {
      const input = chatInput.parse(req.body);
      if (agentMode !== Boolean(input.agentId)) throw httpError(400, 'Choose a valid agent for this endpoint.');
      const agent = agentMode ? await Agent.findOne({ _id: input.agentId, userId: req.user._id, isActive: true }) : null;
      if (agentMode && !agent) throw httpError(404, 'Agent not found.');
      try {
        conversation = await Conversation.findOneAndUpdate({ _id: input.conversationId, userId: req.user._id, agentId: agent?._id || null }, {
          $setOnInsert: { timeZone: input.timeZone },
        }, { upsert: true, returnDocument: 'after', runValidators: true });
      } catch (error) { if (error.code === 11000) throw httpError(404, 'Conversation not found for this agent.'); throw error; }
      const id = `${req.user._id}:${input.requestId}`;
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      try {
        run = await ChatRun.create({ _id: id, userId: req.user._id, conversationId: conversation._id, fingerprint });
      } catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await ChatRun.findById(id);
        if (existing.fingerprint !== fingerprint) throw httpError(409, 'Request ID was already used with different parameters.');
        const response = existing.response ? { ...existing.response } : { message: 'Request is already running. Check history; do not submit it again.' };
        if (existing.status === 'completed') response.actions = (await PendingAction.find({ runId: id })).map(publicAction);
        return res.status(existing.httpStatus || 409).json(response);
      }
      const lock = await Conversation.updateOne({ _id: conversation._id, userId: req.user._id, activeRunId: null }, { $set: { activeRunId: id } });
      if (!lock.modifiedCount) throw httpError(409, 'This conversation already has an active request.');
      locked = true;
      credits = agentMode ? 3 : 1;
      // Reservation and debit occur atomically in the user document before any model/tool call.
      await deductCredits({ userId: req.user._id, credits, reservationId: id });
      const propose = async (tool, args, toolCallId) => publicAction(await PendingAction.findOneAndUpdate({ runId: id, toolCallId }, {
        $setOnInsert: { userId: req.user._id, conversationId: conversation._id, agentId: agent._id, tool, args, expiresAt: new Date(Date.now() + 15 * 60000) },
      }, { upsert: true, returnDocument: 'after', runValidators: true }));
      const graph = agentMode ? await createAgentGraph(agent, req.user._id, { propose, timeZone: conversation.timeZone }) : createChatGraph();
      const result = await graph.invoke({ messages: [new HumanMessage({ content: input.message, id: `human:${id}` })], ...(agentMode ? { toolExecutions: 0, searches: 0, modelSteps: 0 } : {}) }, graphConfig(conversation));
      const aiResponse = readable(result.messages.at(-1)?.content) || 'No response was generated.';
      const actions = await PendingAction.find({ runId: id });
      const response = { aiResponse, conversationId: conversation._id, actions: actions.map(publicAction) };
      await Conversation.updateOne({ _id: conversation._id }, { $push: { messages: { $each: [{ role: 'user', content: input.message, requestId: input.requestId }, { role: 'assistant', content: aiResponse, requestId: input.requestId }] } } });
      const metrics = { durationMs: Date.now() - startedAt, toolExecutions: result.toolExecutions || 0, searches: result.searches || 0, modelSteps: result.modelSteps || 1 };
      await ChatRun.updateOne({ _id: id }, { $set: { status: 'completed', response, httpStatus: 200, metrics } });
      console.info(JSON.stringify({ event: 'chat_completed', runId: id, ...metrics }));
      // A settlement cleanup failure must not turn a completed response into a retryable error.
      await settleCredits({ userId: req.user._id, reservationId: id }).catch(error => console.error('Credit settlement cleanup:', error.message));
      return res.status(200).json(response);
    } catch (error) {
      console.error('Chat request failed:', error.message);
      if (run) {
        const status = error.name === 'ZodError' ? 400 : error.status || 500;
        const response = { message: error.status ? error.message : 'Request failed. Check history before retrying.' };
        // No writes execute during graph runs; revoke unfinished proposals on failure.
        await PendingAction.updateMany({ runId: run._id, status: 'pending' }, { $set: { status: 'rejected' } }).catch(e => console.error(e.message));
        await refundCredits({ userId: req.user._id, credits, reservationId: run._id }).catch(e => console.error('Credit refund pending:', e.message));
        await ChatRun.updateOne({ _id: run._id }, { $set: { status: 'failed', response, httpStatus: status } }).catch(e => console.error(e.message));
      }
      return sendError(res, error);
    } finally {
      if (locked) await Conversation.updateOne({ _id: conversation._id, activeRunId: run._id }, { $set: { activeRunId: null } }).catch(error => console.error('Conversation lock cleanup:', error.message));
    }
  }

  const chat = (req, res) => handleChat(req, res, false);
  const agentChat = (req, res) => handleChat(req, res, true);

  async function getHistory(req, res) {
    try {
      const conversation = await Conversation.findOne({ _id: req.params.id, userId: req.user._id });
      if (!conversation) throw httpError(404, 'Conversation not found.');
      const actions = await PendingAction.find({ conversationId: conversation._id, userId: req.user._id });
      return res.json({ conversationId: conversation._id, agentId: conversation.agentId, messages: conversation.messages, actions: actions.map(publicAction), busy: Boolean(conversation.activeRunId) });
    } catch (error) { return sendError(res, error); }
  }

  async function decideAction(req, res) {
    let conversation;
    let locked = false;
    const lockId = `action:${req.params.id}`;
    try {
      const input = approvalInput.parse(req.body);
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw httpError(400, 'Invalid action ID.');
      conversation = await Conversation.findOne({ _id: input.conversationId, userId: req.user._id });
      if (!conversation) throw httpError(404, 'Conversation not found.');
      const filter = { _id: req.params.id, userId: req.user._id, conversationId: conversation._id, agentId: conversation.agentId };
      const existing = await PendingAction.findOne(filter);
      if (!existing) throw httpError(404, 'Action not found.');
      if (existing.status !== 'pending') return res.json({ action: publicAction(existing) });
      if (input.decision === 'reject') {
        const rejected = await PendingAction.findOneAndUpdate({ ...filter, status: 'pending' }, { $set: { status: 'rejected' } }, { returnDocument: 'after' });
        return res.json({ action: publicAction(rejected || await PendingAction.findOne(filter)) });
      }
      const lock = await Conversation.updateOne({ _id: conversation._id, activeRunId: null }, { $set: { activeRunId: lockId } });
      if (!lock.modifiedCount) throw httpError(409, 'Wait for the current request to finish.');
      locked = true;
      const agent = await Agent.findOne({ _id: conversation.agentId, userId: req.user._id, isActive: true });
      if (!agent) throw httpError(404, 'Agent no longer available.');
      const tools = await createTools({ tools: agent.tools.filter(name => name === existing.tool) }, req.user._id, {
        onProgress: progress => PendingAction.updateOne(filter, { $set: { progress } }),
      });
      const tool = tools.find(t => t.name === existing.tool && WRITE_TOOLS.has(t.name));
      if (!tool) throw httpError(403, 'This tool is no longer connected or permitted.');
      // Validate stored arguments before claiming; the client cannot replace the approved payload.
      await tool.schema.parseAsync(existing.args);
      const result = await executeApprovedAction({
        claim: () => PendingAction.findOneAndUpdate({ ...filter, status: 'pending', expiresAt: { $gt: new Date() } }, { $set: { status: 'executing' } }, { returnDocument: 'after' }),
        execute: action => tool.invoke(action.args, { signal: AbortSignal.timeout(60000) }),
        save: (action, status, receipt) => PendingAction.updateOne({ _id: action._id, status: 'executing' }, { $set: { status, result: receipt } }),
      });
      if (!result) throw httpError(409, 'Action expired or was already handled.');
      const updated = await PendingAction.findOne(filter);
      const content = result.ok ? `Action ${updated.tool} completed: ${readable(result.data) || JSON.stringify(result.data)}` : `Action ${updated.tool} requires attention: ${result.error.message}. Check the connected service before submitting another action.`;
      await Conversation.updateOne({ _id: conversation._id }, { $push: { messages: { role: 'assistant', content } } });
      // Keep model history aware of server-confirmed action results without another model call.
      await createChatGraph().updateState(graphConfig(conversation), { messages: [new AIMessage({ content, id: `action:${updated._id}` })] });
      return res.json({ action: publicAction(updated), aiResponse: content });
    } catch (error) { console.error('Action decision failed:', error.message); return sendError(res, error); }
    finally {
      if (locked) await Conversation.updateOne({ _id: conversation._id, activeRunId: lockId }, { $set: { activeRunId: null } }).catch(error => console.error(error.message));
    }
  }

  return { chat, agentChat, getHistory, decideAction };
}
export const { chat, agentChat, getHistory, decideAction } = createChatHandlers();
