import { createLLM } from './llm.js';
import {
  StateGraph,
  MessagesAnnotation,
} from '@langchain/langgraph';
import {MongoDBSaver} from '@langchain/langgraph-checkpoint-mongodb';
import {MongoClient} from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const llm = createLLM({ temperature: 0.3 });

const client = new MongoClient(process.env.MONGODB_URI);
const checkpointer = new MongoDBSaver({client, dbName: 'langgraph'});

const chatNode = async state => {
  const recentMessages = state.messages.slice(-6);
  const response = await llm.invoke(recentMessages);
  return {
    messages: [response],
  };
};

const workflow = new StateGraph(MessagesAnnotation)
  .addNode('chatNode', chatNode)
  .addEdge('__start__', 'chatNode')
  .addEdge('chatNode', '__end__');

const chatGraph = workflow.compile({checkpointer});

export default chatGraph;
