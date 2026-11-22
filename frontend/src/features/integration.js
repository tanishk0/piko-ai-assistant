import api from '@/api';

export const connectGoogle = async message => {
  try {
    const {data} = await api.get ('/api/integrations/google/connect');
    return data;
  } catch (error) {
    console.log (error);
    return error;
  }
};

export const connectInstagram = async message => {
  try {
    const {data} = await api.get ('/api/integrations/instagram/connect');
    return data;
  } catch (error) {
    console.log (error);
    return error;
  }
};

export const disconnectGoogle = async message => {
  try {
    const {data} = await api.get ('/api/integrations/google/disconnect');
    return data;
  } catch (error) {
    console.log (error);
    return error;
  }
};

export const disconnectInstagram = async message => {
  try {
    const {data} = await api.get ('/api/integrations/instagram/disconnect');
    return data;
  } catch (error) {
    console.log (error);
    return error;
  }
};
