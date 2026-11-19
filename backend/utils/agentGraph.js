import { ChatGroq } from '@langchain/groq';
import {
  StateSchema,
  MessagesValue,
  StateGraph,
  START,
  END,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { SystemMessage } from '@langchain/core/messages';
import { getMcpTools } from '../mcp/lg-mcp.js';
import z, { set } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
dotenv.config();
const llm = new ChatGroq({
  model: 'openai/gpt-oss-120b',
  temperature: 0,
  maxRetries: 2,
});
const client = new MongoClient(process.env.MONGODB_URI);
const checkpointer = new MongoDBSaver({ client, dbName: 'langgraph' });
const findTool = (tools, names) => {
  return tools.find((tool) => names.includes(tool.name))
}
const limitMessageContext=(message, maxChars=2000)=>{
  if(typeof message.content !== "string"){
    return message
  }
  if(message.content.length <= maxChars){
    return message
  }

  return { 
    ...message,
    content: message.content.slice(0, 2000) + `/n[content truncated]`
  }
}
export const createAgentGraph = async (agent, userId) => {
  const mcpTools = await getMcpTools();
  console.log(mcpTools.map(tool => tool.name));

  const webSearchMcpTool = findTool(mcpTools, ["web_search", "automate_web_search"])
  const finalTools = []
  if (webSearchMcpTool) {
    finalTools.push(
      new DynamicStructuredTool(
        {
          name: "web_search",
          description: `search the web for current information, news, tutorials, documentation and factual questions`,
          schema: z.object({
            query: z.string().describe("The search query")
          }),
          func: async () => {
            try {
              const result = await webSearchMcpTool.invoke({ query })
              console.log(result);
              return result
            } catch (error) {

            }
          }
        }
      )
    )
  }




  const llmWithTools = llm.bindTools(finalTools, {
    tool_choice: 'auto',
  });

  const currentDateTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date());

  const systemPrompt = `You are ${agent.name}, an autonomous task-execution agent. Never refer to yourself as ChatGPT or an assistant trained by OpenAI.

Directives:
${agent.instructions}

Rules:
1. Tool Execution: Use available tools to fetch data and perform tasks. Never fabricate tool outputs, URLs, or completed actions.
2. Autonomy & Boundaries: Execute reversible tasks and research independently. Require explicit user confirmation before irreversible actions (sending emails, making payments, publishing, or deleting data).
3. Output Style: Be concise, factual, and direct. Skip pleasantries, filler, and repetitive acknowledgments.`;

  const approvalTools = new Set([
    'send_email',
    'create_calender_event',
    'publish_instagram_post',
  ]);
  const chatNode = async state => {
    const recentMessages = state.messages.slice(-4).map((message)=>limitMessageContext(message))
    
    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...recentMessages,
    ]);

    return {
      messages: [response],
    };
  };

  const toolNode = new ToolNode(finalTools);

  const actionApprovalNode = () => { };

  const routeAfterChat = state => {
    const messages = state.messages || [];
    console.log('state msgs: ', messages);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return '__end__';
    }
    const requiresApproval = lastMessage?.tool_calls?.some((call) => (
      approvalTools.has(call.name)
    ))
    return requiresApproval ? "actionApprovalNode" : "tools"
  };

  const routeAfterApproval = () => { };
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('chatNode', chatNode)
    .addNode('tools', toolNode)
    .addNode('actionApprovalNode', actionApprovalNode)
    .addEdge('__start__', 'chatNode')
    .addConditionalEdges('chatNode', routeAfterChat)
    .addEdge('tools', 'chatNode')
    .addConditionalEdges('actionApprovalNode', routeAfterApproval)

  const chatAgentGraph = workflow.compile({ checkpointer });
  return chatAgentGraph;
};
