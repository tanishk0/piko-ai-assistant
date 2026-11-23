import Agent from '../models/agent.model.js';

export const createAgent = async (req, res) => {
  try {
    const {name, knowledgeBase, instructions, tools} = req.body;
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
      tools: tools || [],
      userId,
    });

    return res.status(201).json(agent);
  } catch (error) {
    return res.status(500).json({message: error.message || 'Create agent error'});
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
