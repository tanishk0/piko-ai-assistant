import { createLLM } from './llm.js';
import {
  StateGraph,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { SystemMessage, ToolMessage } from '@langchain/core/messages';
import { getMcpTools } from '../mcp/lg-mcp.js';
import z from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createGmailTools } from '../tools/gmail.tools.js';
import { createCalendarTools } from '../tools/calendar.tools.js';
import { createInstagramTools } from '../tools/instagram.tools.js';

dotenv.config();

const llm = createLLM();

const client = new MongoClient(process.env.MONGODB_URI);
const checkpointer = new MongoDBSaver({ client, dbName: 'langgraph' });

const findTool = (tools, names) => {
  return tools.find((tool) => names.includes(tool.name));
};

const limitMessageContext = (message) => {
  if (typeof message.content !== 'string') {
    return message;
  }

  // Tool messages: 4000 characters (~1000 tokens)
  // Other messages: 8000 characters (~2000 tokens)
  const msgType = typeof message._getType === 'function' ? message._getType() : null;
  const maxChars = msgType === 'tool' ? 4000 : 8000;

  if (message.content.length <= maxChars) {
    return message;
  }

  return {
    ...message,
    content: message.content.slice(0, maxChars) + '\n[content truncated]',
  };
};

export const createAgentGraph = async (agent, userId) => {
  const finalTools = [];

  // 1. Web Search Tool (via MCP)
  try {
    const mcpTools = await getMcpTools();
    const webSearchMcpTool = findTool(mcpTools, [
      'automate_web_search_tool',
      'web_search_tool',
      'web_search',
      'automate_web_search',
    ]);

    if (webSearchMcpTool) {
      finalTools.push(
        new DynamicStructuredTool({
          name: 'web_search',
          description:
            'Search the web for up-to-date information, news, documentation, and factual queries.',
          schema: z.object({
            query: z.string().describe('The search query keyword or phrase'),
          }),
          func: async ({ query }) => {
            try {
              const result = await webSearchMcpTool.invoke({ query });
              return typeof result === 'string'
                ? result
                : JSON.stringify(result);
            } catch (error) {
              return `Web search error: ${error.message || error}`;
            }
          },
        })
      );
    }
  } catch (err) {
    console.error('Failed to load MCP web search tool:', err);
  }

  // 2. Calculator
  finalTools.push(
    new DynamicStructuredTool({
      name: 'calculator',
      description:
        'Perform arithmetic computations and mathematical evaluations.',
      schema: z.object({
        expression: z
          .string()
          .describe(
            'Math expression to evaluate, e.g. "125 * 45" or "(1200 / 4) + 50"'
          ),
      }),
      func: async ({ expression }) => {
        try {
          const sanitized = expression.replace(/[^0-9+\-*/().%^ \t]/g, '');
          const result = Function(`"use strict"; return (${sanitized})`)();
          return `Result: ${result}`;
        } catch (error) {
          return `Calculation error: ${error.message || error}`;
        }
      },
    })
  );

  // 3. Gmail Tools
  try {
    const gmailTools = await createGmailTools(userId);
    finalTools.push(...gmailTools);
  } catch (err) {
    console.error('Failed to load Gmail tools:', err);
  }

  // 4. Google Calendar Tools
  try {
    const calendarTools = await createCalendarTools(userId);
    finalTools.push(...calendarTools);
  } catch (err) {
    console.error('Failed to load Calendar tools:', err);
  }

  // 5. Instagram Tools
  try {
    const instagramTools = await createInstagramTools(userId);
    finalTools.push(...instagramTools);
  } catch (err) {
    console.error('Failed to load Instagram tools:', err);
  }

  const llmWithTools =
    finalTools.length > 0
      ? llm.bindTools(finalTools, { tool_choice: 'auto' })
      : llm;

  const now = new Date();
  const currentDateTimeFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(now);

  const isoDateTime = now.toISOString();

  const systemPrompt = `You are ${agent.name}, an autonomous task-execution agent on the Automate AI platform.
Never refer to yourself as ChatGPT or an AI assistant trained by OpenAI.

Temporal Context:
Current Date and Time: ${currentDateTimeFormatted} (ISO: ${isoDateTime})
Use this context to accurately interpret relative time queries such as "today", "tomorrow", "this afternoon", "next week", etc.

Directives:
${agent.instructions}

${agent.knowledgeBase ? `Knowledge Base:\n${agent.knowledgeBase}\n` : ''}

Operational Rules & Safety Policies:
1. Missing Information & Clarifications:
   - Always verify that you have all essential details before performing any task.
   - If any required parameter is missing (e.g. recipient email address, subject, message body, meeting date/time, post image URL, or caption), DO NOT assume, guess, or invent it. Proactively ask the user for the missing information.

2. Action Approval & Confirmation Judgment:
   - For irreversible, modifying, or external-facing actions (sending emails with gmail_send, scheduling events with calendar_create_event, deleting events with calendar_delete_event, or publishing Instagram posts with instagram_publish_photo):
     * If the user has NOT confirmed yet, DO NOT call these tools. Instead, present a clear, formatted draft or summary of the proposed action (recipient, subject, body preview, date/time) and ask the user for confirmation.
     * Once the user has confirmed (e.g. saying "yes", "proceed", "send it", "looks good", "go ahead", or confirming in any natural phrasing), YOU must immediately proceed and execute the tool to complete the action. Do not ask for confirmation again if the user has already approved.

3. Read-Only Tasks:
   - Safe queries like searching the web, checking inbox emails, viewing upcoming calendar events, or reading Instagram stats can be performed autonomously without pre-confirmation.

4. Search & Tool Efficiency:
   - Perform at most 2 to 3 targeted searches per user request.
   - Once you have gathered sufficient information, synthesize your findings and respond directly. Do not repeatedly search in a loop.

5. Output Style:
   - Be concise, direct, and helpful. Use clean Markdown formatting for email drafts, event schedules, and lists.`;

  const MAX_CONTEXT_MESSAGES = 20;
  const MAX_TOOL_CALLS_PER_STEP = 3;
  const MAX_TOOL_CYCLES_PER_TURN = 3;

  const chatNode = async (state) => {
    const allMessages = state.messages || [];

    // Count how many tool executions occurred in the current turn (since the latest HumanMessage)
    let lastHumanIdx = -1;
    for (let idx = allMessages.length - 1; idx >= 0; idx--) {
      if (
        typeof allMessages[idx]._getType === 'function' &&
        allMessages[idx]._getType() === 'human'
      ) {
        lastHumanIdx = idx;
        break;
      }
    }

    const messagesSinceHuman =
      lastHumanIdx >= 0 ? allMessages.slice(lastHumanIdx) : allMessages;
    const toolCyclesCount = messagesSinceHuman.filter(
      (m) => typeof m._getType === 'function' && m._getType() === 'tool'
    ).length;

    // If tool search budget is reached, invoke plain llm (without tools)
    // to strictly force a textual synthesis answer and break infinite loops.
    const budgetReached = toolCyclesCount >= MAX_TOOL_CYCLES_PER_TURN;
    const activeLlm =
      budgetReached || finalTools.length === 0 ? llm : llmWithTools;

    // --- Smart context windowing ---
    // Always preserve the first HumanMessage (the user's original prompt)
    // plus the most recent messages, so the LLM never forgets the task.
    let contextMessages;

    if (allMessages.length <= MAX_CONTEXT_MESSAGES) {
      // Everything fits, no slicing needed
      contextMessages = allMessages.map((m) => limitMessageContext(m));
    } else {
      // Find the first HumanMessage (the user's original prompt)
      const firstHumanIdx = allMessages.findIndex(
        (m) => typeof m._getType === 'function' && m._getType() === 'human'
      );

      const tail = allMessages.slice(-(MAX_CONTEXT_MESSAGES - 1));

      if (firstHumanIdx !== -1 && !tail.includes(allMessages[firstHumanIdx])) {
        // First human message got sliced off — prepend it
        contextMessages = [
          limitMessageContext(allMessages[firstHumanIdx]),
          ...tail.map((m) => limitMessageContext(m)),
        ];
      } else {
        // First human message is already in the tail
        contextMessages = tail.map((m) => limitMessageContext(m));
      }
    }

    if (budgetReached) {
      contextMessages.push(
        new SystemMessage(
          'Tool execution limit reached. Synthesize and deliver your final comprehensive answer to the user now using the information gathered above.'
        )
      );
    }

    const response = await activeLlm.invoke([
      new SystemMessage(systemPrompt),
      ...contextMessages,
    ]);

    // --- Limit tool calls per step ---
    // If the LLM emitted more tool calls than allowed, keep only the first N
    // to prevent TPM explosion from parallel tool calls.
    if (
      response.tool_calls &&
      response.tool_calls.length > MAX_TOOL_CALLS_PER_STEP
    ) {
      response.tool_calls = response.tool_calls.slice(
        0,
        MAX_TOOL_CALLS_PER_STEP
      );

      // Also clean up additional_kwargs.tool_calls to stay in sync
      if (response.additional_kwargs?.tool_calls) {
        response.additional_kwargs.tool_calls =
          response.additional_kwargs.tool_calls.slice(
            0,
            MAX_TOOL_CALLS_PER_STEP
          );
      }
    }

    return {
      messages: [response],
    };
  };

  const routeAfterChat = (state) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      return '__end__';
    }

    return 'tools';
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('chatNode', chatNode)
    .addEdge('__start__', 'chatNode');

  if (finalTools.length > 0) {
    const toolNode = new ToolNode(finalTools);
    workflow
      .addNode('tools', toolNode)
      .addConditionalEdges('chatNode', routeAfterChat)
      .addEdge('tools', 'chatNode');
  } else {
    workflow.addEdge('chatNode', '__end__');
  }

  const chatAgentGraph = workflow.compile({ checkpointer });
  return chatAgentGraph;
};
