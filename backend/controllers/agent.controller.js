import Agent from '../models/agent.model.js';
import z from 'zod';
import { TOOL_NAMES, DEFAULT_TOOLS } from '../utils/toolPolicy.js';
const agentInput = z.object({ name: z.string().trim().min(1).max(100), instructions: z.string().trim().min(1).max(10000), knowledgeBase: z.string().max(12000).default(''), tools: z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length).default(DEFAULT_TOOLS) }).strict();

export const createAgent = async (req, res) => {
  try {
    const {name, knowledgeBase, instructions, tools} = agentInput.parse(req.body);
    if (!name || !instructions) {
      return res
        .status(400)
        .json({message: 'Name and instructions are required'});
    }
    const userId = req.user._id;
    const existingAgent = await Agent.findOne({name, userId});
    if (existingAgent) {
      return res.status(400).json({
        message: 'You already have an agent with this name',
      });
    }

    const agent = await Agent.create({
      name,
      knowledgeBase,
      instructions,
      tools: [...new Set(tools)],
      userId,
    });

    return res.status(201).json(agent);
  } catch (error) {
    return res.status(error.name === 'ZodError' ? 400 : error.code === 11000 ? 409 : 500).json({message: error.name === 'ZodError' ? 'Invalid agent configuration' : error.code === 11000 ? 'Agent name already exists' : 'Create agent error'});
  }
};

export const getAllAgents = async (req, res) => {
  try {
    const userId = req.user._id;

    const agents = await Agent.find({
      userId,
    }).sort({createdAt: -1});

    return res.status(200).json(agents);
  } catch (error) {
    return res.status(500).json({message: error.message || 'Get all agents error'});
  }
};

export const getAgentById = async (req, res) => {
  try {
    const agentId = req.params.id;
    const agent = await Agent.findOne({_id: agentId, userId: req.user._id});

    if (!agent) {
      return res.status(404).json({message: 'Agent not found'});
    }

    return res.status(200).json(agent);
  } catch (error) {
    return res.status(500).json({message: error.message || 'Get agent error'});
  }
};

export const deleteAgent = async (req, res) => {
  try {
    const agentId = req.params.id;
    const agent = await Agent.findOneAndDelete({_id: agentId, userId: req.user._id});

    if (!agent) {
      return res.status(404).json({message: 'Agent not found'});
    }

    return res.status(200).json(agent);
  } catch (error) {
    return res.status(500).json({message: error.message || 'Delete agent error'});
  }
};

export const updateAgentTools = async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid agent ID' });
    const { tools } = z.object({ tools: z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length) }).strict().parse(req.body);
    const agent = await Agent.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { tools: [...new Set(tools)] } }, { returnDocument: 'after', runValidators: true });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    return res.json(agent);
  } catch (error) { return res.status(error.name === 'ZodError' ? 400 : 500).json({ message: 'Could not update tool permissions' }); }
};
