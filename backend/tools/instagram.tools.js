import { DynamicStructuredTool } from '@langchain/core/tools';
import axios from 'axios';
import z from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import Integration from '../models/integration.model.js';
import { decrypt } from '../config/crypt.js';

export async function createInstagramTools(userId, { onProgress = async () => {} } = {}) {
  const connection = await Integration.findOne({ userId, provider: 'instagram', status: 'connected' }).select('+tokens.accessToken');
  if (!connection?.tokens?.accessToken || (connection.tokens.expiresAt && connection.tokens.expiresAt <= new Date())) return [];
  const token = decrypt(connection.tokens.accessToken);
  const base = `https://graph.facebook.com/${process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0'}`;
  const accountId = connection.providerAccountId;
  const options = config => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 10000, signal: config?.signal });
  return [
    new DynamicStructuredTool({
      name: 'instagram_get_profile', description: 'Read connected Instagram account profile and statistics.', schema: z.object({}),
      func: async (_, config) => (await axios.get(`${base}/${accountId}`, { ...options(config), params: { fields: 'id,username,name,biography,followers_count,follows_count,media_count' } })).data,
    }),
    new DynamicStructuredTool({
      name: 'instagram_get_recent_posts', description: 'Read recent Instagram posts and engagement counts. Use nextCursor for continuation.', schema: z.object({ limit: z.number().int().min(1).max(10).default(5), after: z.string().max(2000).optional() }),
      func: async ({ limit, after }, config) => {
        const response = await axios.get(`${base}/${accountId}/media`, { ...options(config), params: { fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count', limit, after } });
        return { posts: response.data.data || [], nextCursor: response.data.paging?.next ? response.data.paging?.cursors?.after : null };
      },
    }),
    new DynamicStructuredTool({
      name: 'instagram_publish_photo', description: 'Propose publishing a publicly hosted JPEG photo with a caption. Requires UI approval.',
      schema: z.object({ imageUrl: z.url().max(2000).refine(value => new URL(value).protocol === 'https:', 'Use an HTTPS image URL'), caption: z.string().max(2200) }),
      func: async ({ imageUrl, caption }, config) => {
        const created = await axios.post(`${base}/${accountId}/media`, { image_url: imageUrl, caption }, options(config));
        const creationId = created.data.id;
        if (!creationId) throw new Error('Provider did not return a media container ID.');
        await onProgress({ creationId, stage: 'container_created' });
        let ready = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          const response = await axios.get(`${base}/${creationId}`, { ...options(config), params: { fields: 'status_code,status' } });
          if (response.data.status_code === 'FINISHED') { ready = true; break; }
          if (['ERROR', 'EXPIRED'].includes(response.data.status_code)) throw new Error(`Media container ${creationId}: ${response.data.status || response.data.status_code}`);
          await delay(1000, undefined, { signal: config?.signal });
        }
        if (!ready) throw new Error(`Media container ${creationId} is still processing. Inspect its status before creating another post.`);
        await onProgress({ creationId, stage: 'publishing' });
        const published = await axios.post(`${base}/${accountId}/media_publish`, { creation_id: creationId }, options(config));
        await onProgress({ creationId, mediaId: published.data.id, stage: 'published' });
        return { creationId, mediaId: published.data.id };
      },
    }),
  ];
}
