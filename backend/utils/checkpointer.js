import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';

let client;
let saver;
export function getCheckpointer() {
  if (!saver) {
    client = new MongoClient(process.env.MONGODB_URI);
    saver = new MongoDBSaver({ client, dbName: 'langgraph' });
  }
  return saver;
}
export async function closeCheckpointer() { await client?.close(); }
