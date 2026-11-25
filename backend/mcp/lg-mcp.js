import { MCPAdapter } from '@langchain/mcp-adapters';
import { fileURLToPath } from 'node:url';

const adapter = new MCPAdapter({ servers: { automate: { transport: 'stdio', command: process.execPath, args: [fileURLToPath(new URL('server.js', import.meta.url))], defaultToolTimeout: 25000 } } });
let pending;
export function getMcpTools() {
  if (!pending) pending = adapter.listTools().catch(error => { pending = null; throw error; });
  return pending;
}
export async function closeMcp() { pending = null; await adapter.close(); }
