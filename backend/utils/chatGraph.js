import {ChatGroq} from '@langchain/groq';
import {
  StateSchema,
  MessagesValue,
  StateGraph,
  START,
  END,
  MessagesAnnotation,
} from '@langchain/langgraph';
import {MongoDBSaver} from '@langchain/langgraph-checkpoint-mongodb';
import {MongoClient} from 'mongodb';
import dotenv from 'dotenv';
dotenv.config ();
const llm = new ChatGroq ({
  model: 'openai/gpt-oss-120b',
  temperature: 0,
  maxTokens: 200,
  maxRetries: 2,
});
const client = new MongoClient (process.env.MONGODB_URI);
const checkpointer = new MongoDBSaver ({client, dbName: 'langgraph'});
const chatNode = async state => {
  const response = await llm.invoke (state.messages);

  return {
    messages: [response],
  };
};

const workflow = new StateGraph (MessagesAnnotation)
  .addNode ('chatNode', chatNode)
  .addEdge ('__start__', 'chatNode')
  .addEdge ('__start__', '__end__');

const chatGraph = workflow.compile ({checkpointer});

export default chatGraph;
