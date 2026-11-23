import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

export function createLLM(overrides = {}) {
  const provider = (overrides.provider || process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const model = overrides.model || process.env.LLM_MODEL;
  const temperature = overrides.temperature ?? 0.2;
  const maxRetries = overrides.maxRetries ?? 2;

  switch (provider) {
    case 'nvidia':
      return new ChatOpenAI({
        model: model || 'nvidia/llama-3.1-nemotron-70b-instruct',
        temperature,
        maxRetries,
        apiKey: process.env.NVIDIA_API_KEY,
        configuration: {
          baseURL: 'https://integrate.api.nvidia.com/v1',
        },
      });

    case 'openai':
      return new ChatOpenAI({
        model: model || 'gpt-4o-mini',
        temperature,
        maxRetries,
        apiKey: process.env.OPENAI_API_KEY,
      });

    case 'groq':
    default:
      return new ChatGroq({
        model: model || 'qwen/qwen3-27b',
        temperature,
        maxRetries,
        apiKey: process.env.GROQ_API_KEY,
      });
  }
}
