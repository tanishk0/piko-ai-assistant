import {ChatGroq} from '@langchain/groq';
import {
  StateSchema,
  MessagesValue,
  StateGraph,
  START,
  END,
  MessagesAnnotation,
} from '@langchain/langgraph';
import {ToolNode} from '@langchain/langgraph/prebuilt';
import {MongoDBSaver} from '@langchain/langgraph-checkpoint-mongodb';
import {MongoClient} from 'mongodb';
import dotenv from 'dotenv';
import {tool} from '@langchain/core/tools';
import { SystemMessage } from '@langchain/core/messages';
dotenv.config ();
const llm = new ChatGroq ({
  model: 'openai/gpt-oss-120b',
  temperature: 0,
  maxTokens: 200,
  maxRetries: 2,
});
const client = new MongoClient (process.env.MONGODB_URI);
const checkpointer = new MongoDBSaver ({client, dbName: 'langgraph'});

const systemPrompt=`You are Patrick a smart agent builder platform and a helpful smart personal assistant. You are given many tools and you can spawn agents with their own names, think smartly and fulfill user request.`

const chatNode = async state => {
  const response = await llm.invoke ([
    new SystemMessage()
  ]);

  return {
    messages: [response],
  };
};

const toolNode = new ToolNode ();

const actionApprovalNode = () => {};

const routeAfterChat = () => {};

const routeAfterApproval = () => {};

const workflow = new StateGraph (MessagesAnnotation)
  .addNode ('chatNode', chatNode)
  .addNode ('tools', toolNode)
  .addNode ('actionApprovalNode', actionApprovalNode)
  .addEdge ('__start__', 'chatNode')
  .addConditionalEdges ('chatNode', routeAfterChat)
  .addEdge ('tools', 'chatNode')
  .addConditionalEdges ('actionApprovalNode', routeAfterApproval)
  .addEdge ('chatNode', '__end__');

const chatAgentGraph = workflow.compile ({checkpointer});
