import { apiRequest } from './apiClient';
import { containsSecret } from './helpChat';
export const ticketStatuses = ['Open', 'In progress', 'Resolved'];
export const ticketCategories = ['account', 'upload', 'quiz', 'review', 'other'];
export const listServerTickets = (signal, cursor = null, filters = {}) => {
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(filters))if(value!=='' && value!==null && value!==undefined)query.set(key,String(value));
  if(cursor)query.set('cursor',cursor);
  return apiRequest(`/tickets${query.size ? `?${query}` : ''}`,{signal});
};
export const getServerTicket = (id, signal) => apiRequest(`/tickets/${encodeURIComponent(id)}`, { signal });
export const getLoginConversation = (signal) => apiRequest('/tickets/current-session', { signal });
export async function sendLoginMessage(conversationId, text, language, clientId) {
  check(text);
  return apiRequest('/tickets/current-session/messages', { method: 'POST', body: { conversationId, text, language, clientId } });
}
function check(...values) {
  if (values.some(containsSecret)) throw new Error('Remove passwords, verification codes and API keys before submitting.');
}
export async function createServerTicket({ clientId, category, title, description }) {
  check(title, description);
  return apiRequest('/tickets', { method: 'POST', body: { clientId, category, title, description } });
}
export async function replyServerTicket(id, text, clientId) {
  check(text);
  return apiRequest(`/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', body: { clientId, text } });
}
export const updateServerTicket = (id, status, version) => apiRequest(`/tickets/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status, version } });
export const requestHumanSupport = (id, clientId) => apiRequest(`/tickets/${encodeURIComponent(id)}/human-support`, { method: 'POST', body: { clientId } });
