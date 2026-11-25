import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  conversationId: { type: String, required: true, index: true },
  fingerprint: { type: String, required: true },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  response: mongoose.Schema.Types.Mixed,
  httpStatus: Number,
  metrics: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
export default mongoose.model('ChatRun', schema);
