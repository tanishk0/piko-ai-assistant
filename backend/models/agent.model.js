import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema (
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    knowledgeBase: {
      type: String,
      maxlength: 12000,
    },
    instructions: {
      type: String,
      required: true,
      maxlength: 10000,
    },
    tools: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {timestamps: true}
);

agentSchema.index({ userId: 1, name: 1 }, { unique: true });
const Agent = mongoose.model ('Agent', agentSchema);
export default Agent;
