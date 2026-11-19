import mongoose from 'mongoose';
import {lowercase} from 'zod';

const integrationSchema = new mongoose.Schema (
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ['google', 'instagram'],
    },
    services: [
      {
        type: String,
        enum: ['gmail', 'google_calender', 'instagram'],
      },
    ],
    providerAccoundId: {
      type: String,
      required: true,
    },
    account: {
      email: {
        type: String,
        lowercase: true,
        trim: true,
      },
      username: {
        type: String,
        trim: true,
      },
      displayName: {
        type: String,
        trim: true,
      },
    },
    tokens: {
      accessToken: {
        type: String,
        select: false,
      },
      accessToken: {
        type: String,
        select: false,
      },
      expiresAt: {
        type: Date,
      },
    },
    scopes: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ['connected', 'expired', 'revoked', 'error'],
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastUserAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {timestamps: true}
);

const Integration = mongoose.model ('Integration', integrationSchema);
export default Integration;
