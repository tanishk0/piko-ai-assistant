import { google } from 'googleapis';
import Integration from '../models/integration.model.js';
import { decrypt, encrypt } from '../config/crypt.js';

export const getGoogleAuthClient = async (userId) => {
  const googleConn = await Integration.findOne({
    userId,
    provider: 'google',
    status: 'connected',
  }).select('+tokens.accessToken +tokens.refreshToken');

  if (!googleConn || !googleConn.tokens?.accessToken) {
    return {
      client: null,
      error: 'Google account is not connected. Please connect your Google account in the Integrations page.',
    };
  }

  try {
    const accessToken = decrypt(googleConn.tokens.accessToken);
    const refreshToken = googleConn.tokens?.refreshToken
      ? decrypt(googleConn.tokens.refreshToken)
      : undefined;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8000/api/integrations/google/callback'
    );

