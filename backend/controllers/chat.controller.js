import Agent from '../models/agent.model.js';
import { createAgentGraph } from '../utils/agentGraph.js';
import chatGraph from '../utils/chatGraph.js';
import { HumanMessage } from '@langchain/core/messages';

export const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({
        message: 'Message is required',
      });
    }
    const threadId = req.user._id.toString();
    const data = await chatGraph.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      {
        configurable: { thread_id: threadId },
      }
    );

    const lastMessage = data.messages[data.messages.length - 1]?.content || '';

    return res.status(200).json({
      aiResponse: typeof lastMessage === 'string' ? lastMessage : JSON.stringify(lastMessage),
    });
  } catch (error) {
    return res.status(500).json({
      message: `Chat error: ${error.message || error}`,
    });
  }
};

export const agentChat = async (req, res) => {
  try {
    const { message, agent } = req.body;
    if (!message) {
      return res.status(400).json({
        message: 'Message is required',
      });
    }

    // 1. Look up agent for this user (or fallback by name)
    const existingAgent =
      (await Agent.findOne({ name: agent, userId: req.user._id })) ||
      (await Agent.findOne({ name: agent }));

    if (!existingAgent) {
      return res.status(404).json({
        message: 'Agent not found',
      });
    }

    // 2. Scope the thread ID to both the user AND the agent
    const threadId = `${req.user._id.toString()}_${existingAgent._id.toString()}`;

    const graph = await createAgentGraph(existingAgent, req.user._id);
    const result = await graph.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      {
        configurable: { thread_id: threadId },
        recursionLimit: 8,
      }
    );
    const lastMessage = result.messages[result.messages.length - 1]?.content || '';
    return res.status(200).json({
      aiResponse: typeof lastMessage === 'string' ? lastMessage : JSON.stringify(lastMessage),
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    return res.status(500).json({
      message: `Agent chat error: ${error.message || error}`,
    });
  }
};
