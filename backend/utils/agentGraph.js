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
  }

  // 3. Gmail Integration Tools
  const wantsGmailRead =
    noFilter ||
    agentToolsRequested.includes('gmail.read') ||
    agentToolsRequested.includes('gmail');
  const wantsGmailSend =
    noFilter ||
    agentToolsRequested.includes('gmail.send') ||
    agentToolsRequested.includes('gmail');

  if (wantsGmailRead || wantsGmailSend) {
    try {
      const gmailTools = await createGmailTools(userId);
      for (const t of gmailTools) {
        if (
          (t.name === 'gmail_read' || t.name === 'gmail_get_email_details') &&
          !wantsGmailRead
        ) {
          continue;
        }
        if (t.name === 'gmail_send' && !wantsGmailSend) {
          continue;
        }
        finalTools.push(t);
      }
    } catch (err) {
      console.error('Failed to load Gmail tools:', err);
    }
  }

  // 4. Google Calendar Tools
  const wantsCalendarRead =
    noFilter ||
    agentToolsRequested.includes('calendar.read') ||
    agentToolsRequested.includes('calendar');
  const wantsCalendarCreate =
    noFilter ||
    agentToolsRequested.includes('calendar.create') ||
    agentToolsRequested.includes('calendar');

  if (wantsCalendarRead || wantsCalendarCreate) {
    try {
      const calendarTools = await createCalendarTools(userId);
      for (const t of calendarTools) {
        if (t.name === 'calendar_list_events' && !wantsCalendarRead) {
          continue;
        }
        if (
          (t.name === 'calendar_create_event' ||
            t.name === 'calendar_delete_event') &&
          !wantsCalendarCreate
        ) {
          continue;
        }
        finalTools.push(t);
      }
    } catch (err) {
      console.error('Failed to load Calendar tools:', err);
    }
  }

  // 5. Instagram Integration Tools
  const wantsInstagramRead =
    noFilter ||
    agentToolsRequested.includes('instagram.read') ||
    agentToolsRequested.includes('instagram');
  const wantsInstagramPost =
    noFilter ||
    agentToolsRequested.includes('instagram.post') ||
    agentToolsRequested.includes('instagram');

  if (wantsInstagramRead || wantsInstagramPost) {
    try {
      const instagramTools = await createInstagramTools(userId);
      for (const t of instagramTools) {
        if (
          (t.name === 'instagram_get_profile' ||
            t.name === 'instagram_get_recent_posts') &&
          !wantsInstagramRead
        ) {
          continue;
        }
        if (t.name === 'instagram_publish_photo' && !wantsInstagramPost) {
          continue;
        }
        finalTools.push(t);
      }
    } catch (err) {
      console.error('Failed to load Instagram tools:', err);
    }
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

Rules:
1. Tool Execution: Use available tools to fetch data, schedule events, read/send emails, or interact with Instagram. Never fabricate tool outputs, IDs, or completed actions.
2. Directness: Be concise, clear, and action-oriented. Present lists, email previews, or event details in well-formatted markdown.`;

  const chatNode = async (state) => {
    const recentMessages = (state.messages || [])
      .slice(-6)
      .map((message) => limitMessageContext(message));

    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...recentMessages,
    ]);

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
