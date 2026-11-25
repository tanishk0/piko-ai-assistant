import { useEffect, useRef, useState } from 'react';
import { chat, agentChat, getChatHistory, decideChatAction } from './chat.js';

export function useConversation(userId, agentId) {
  const storageKey = `automate-conversation:${userId}:${agentId || 'default'}`;
  const [conversationId, setConversationId] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const id = saved && /^[a-f\d-]{36}$/i.test(saved) ? saved : crypto.randomUUID();
    localStorage.setItem(storageKey, id);
    return id;
  });
  const [messages, setMessages] = useState([]);
  const [actions, setActions] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(null);
  const [busy, setBusy] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const gate = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    getChatHistory(conversationId, controller.signal).then(data => {
      setMessages(data.messages); setActions(data.actions); setBusy(data.busy);
    }).catch(err => {
      if (err.code !== 'ERR_CANCELED' && err.response?.status !== 404) {
        setHistoryUnavailable(true);
        setError('Could not load conversation history. Refresh before sending.');
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [conversationId]);
  async function send(input) {
    if (gate.current || loading || busy || historyUnavailable) return;
    gate.current = true; setSending(true); setError('');
    setMessages(prev => [...prev.filter(m => m.requestId !== input.requestId), { role: 'user', content: input.message, requestId: input.requestId }]);
    try {
      const response = await (agentId ? agentChat(input) : chat(input));
      setMessages(prev => [...prev, { role: 'assistant', content: response.aiResponse, requestId: input.requestId }]);
      setActions(prev => [...prev, ...(response.actions || []).filter(a => !prev.some(p => p.id === a.id))]);
      setRetry(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Connection lost. Retry uses the same request ID to avoid duplicate execution.');
      setRetry(!err.response || err.response.status === 409 ? input : null);
    } finally { gate.current = false; setSending(false); }
  }
  async function submit(message) {
    await send({ message, conversationId, requestId: crypto.randomUUID(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(agentId ? { agentId } : {}) });
  }
  async function decide(action, decision) {
    if (gate.current || busy) return;
    gate.current = true; setSending(true); setError('');
    try {
      const response = await decideChatAction(action.id, conversationId, decision);
      setActions(prev => prev.map(a => a.id === action.id ? response.action : a));
      if (response.aiResponse) setMessages(prev => [...prev, { role: 'assistant', content: response.aiResponse }]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not confirm action status. Refresh history before trying again.');
      const history = await getChatHistory(conversationId).catch(() => null);
      if (history) { setActions(history.actions); setBusy(history.busy); }
    } finally { gate.current = false; setSending(false); }
  }
  function newChat() {
    if (sending || loading) return;
    const id = crypto.randomUUID(); localStorage.setItem(storageKey, id);
    setMessages([]); setActions([]); setRetry(null); setError(''); setBusy(false); setHistoryUnavailable(false); setLoading(true); setConversationId(id);
  }
  return { messages, actions, sending: sending || loading, busy, historyUnavailable, error, submit, decide, newChat, retryRequest: retry ? () => send(retry) : null };
}
