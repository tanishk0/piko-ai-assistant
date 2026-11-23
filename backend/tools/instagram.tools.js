import { DynamicStructuredTool } from '@langchain/core/tools';
import axios from 'axios';
import z from 'zod';
import Integration from '../models/integration.model.js';
import { decrypt } from '../config/crypt.js';

const getInstagramClient = async (userId) => {
  const instaConn = await Integration.findOne({
    userId,
    provider: 'instagram',
    status: 'connected',
  }).select('+tokens.accessToken');

  if (!instaConn || !instaConn.tokens?.accessToken) {
    return {
      token: null,
      accountId: null,
      error: 'Instagram is not connected. Please connect your Instagram account in the Integrations page.',
    };
  }

  try {
    const token = decrypt(instaConn.tokens.accessToken);
    return {
      token,
      accountId: instaConn.providerAccountId,
      error: null,
    };
  } catch (err) {
    return {
      token: null,
      accountId: null,
      error: `Failed to decrypt Instagram access token: ${err.message || err}`,
    };
  }
};

export const createInstagramTools = async (userId) => {
  const { token, accountId, error } = await getInstagramClient(userId);
  const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0';

  const instagramGetProfileTool = new DynamicStructuredTool({
    name: 'instagram_get_profile',
    description:
      'Fetch profile statistics and details for the connected Instagram account (followers, media count, bio, username).',
    schema: z.object({}),
    func: async () => {
      if (error || !token || !accountId) {
        return error || 'Instagram is not connected. Please connect Instagram in the Integrations page.';
      }
      try {
        const res = await axios.get(
          `https://graph.facebook.com/${graphVersion}/${accountId}`,
          {
            params: {
              fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url',
              access_token: token,
            },
            timeout: 10000,
          }
        );

        const data = res.data;
        return `Instagram Profile:\n• Username: @${data.username}\n• Name: ${data.name || 'N/A'}\n• Bio: ${data.biography || 'No bio'}\n• Followers: ${data.followers_count ?? 'N/A'}\n• Following: ${data.follows_count ?? 'N/A'}\n• Total Posts: ${data.media_count ?? 'N/A'}`;
      } catch (err) {
        return `Failed to fetch Instagram profile: ${err.response?.data?.error?.message || err.message || err}`;
      }
    },
  });

  const instagramGetRecentPostsTool = new DynamicStructuredTool({
    name: 'instagram_get_recent_posts',
    description: 'Retrieve recent media posts, captions, like counts, and comments from the connected Instagram account.',
    schema: z.object({
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Number of recent posts to retrieve (1-10)'),
    }),
    func: async ({ limit = 5 }) => {
      if (error || !token || !accountId) {
        return error || 'Instagram is not connected.';
      }
      try {
        const res = await axios.get(
          `https://graph.facebook.com/${graphVersion}/${accountId}/media`,
