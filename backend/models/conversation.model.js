import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  activeRunId: { type: String, default: null },
  timeZone: { type: String, required: true },
  messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
export default mongoose.model('Conversation', schema);
