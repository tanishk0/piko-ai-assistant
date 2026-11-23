import {google} from 'googleapis';

const redirectUri =
  process.env.GOOGLE_REDIRECT_URI ||
  'http://localhost:8000/api/integrations/google/callback';

export const googleOAuthclient = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
export const scopes = [
  'openid',
  'gmail',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail',
];
