import api from '@/api';

export const connectGoogle = async () => {
  const {data} = await api.get ('/api/integrations/google/connect');
  return data;
};

export const connectInstagram = async () => {
  const {data} = await api.get ('/api/integrations/instagram/connect');
  return data;
};

export const disconnectGoogle = async () => {
  const {data} = await api.delete ('/api/integrations/google/disconnect');
  return data;
};

export const disconnectInstagram = async () => {
  const {data} = await api.delete ('/api/integrations/instagram/disconnect');
  return data;
};
export const getAllIntegrations = async () => {
  const {data} = await api.get ('/api/integrations/all');
  return data;
};
