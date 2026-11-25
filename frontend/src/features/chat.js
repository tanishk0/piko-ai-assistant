import api from '@/api';
export const chat = async input => (await api.post('/api/chat', input)).data;
export const agentChat = async input => (await api.post('/api/chat/agent', input)).data;
export const getChatHistory = async (id, signal) => (await api.get(`/api/chat/conversations/${id}`, { signal })).data;
export const decideChatAction = async (id, conversationId, decision) => (await api.post(`/api/chat/actions/${id}`, { conversationId, decision })).data;
