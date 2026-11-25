import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  conversationId: { type: String, required: true, index: true },
  runId: { type: String, required: true },
  toolCallId: { type: String, required: true },
  tool: { type: String, required: true },
  args: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'executing', 'succeeded', 'failed', 'unknown', 'rejected'], default: 'pending' },
  expiresAt: { type: Date, required: true },
  result: mongoose.Schema.Types.Mixed,
  progress: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
schema.index({ runId: 1, toolCallId: 1 }, { unique: true });
export default mongoose.model('PendingAction', schema);
