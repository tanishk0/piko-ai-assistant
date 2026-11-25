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

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: googleConn.tokens.expiresAt?.getTime(),
    });

    oauth2Client.on('tokens', async (tokens) => {
      try {
        if (tokens.access_token) {
          googleConn.tokens.accessToken = encrypt(tokens.access_token);
        }
        if (tokens.refresh_token) {
          googleConn.tokens.refreshToken = encrypt(tokens.refresh_token);
        }
        if (tokens.expiry_date) {
          googleConn.tokens.expiresAt = new Date(tokens.expiry_date);
        }
        await googleConn.save();
      } catch (err) {
        console.error('Error saving auto-refreshed Google tokens:', err);
      }
    });

    return { client: oauth2Client, error: null };
  } catch (err) {
    return {
      client: null,
      error: `Failed to decrypt Google authorization credentials: ${err.message || err}`,
    };
  }
};
