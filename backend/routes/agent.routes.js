import express from "express"
import protect from "../middleware/protect.js"
import { createAgent, getAgentById, getAllAgents, deleteAgent, updateAgentTools} from "../controllers/agent.controller.js"

const agentRouter = express.Router()

agentRouter.post("/create",protect, createAgent)
agentRouter.get("/all", protect, getAllAgents)
agentRouter.get("/:id", protect, getAgentById)
agentRouter.delete("/:id", protect, deleteAgent)
agentRouter.patch("/:id/tools", protect, updateAgentTools)

export default agentRouter
