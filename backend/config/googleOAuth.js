import {google} from 'googleapis';

export const googleOAuthclient = new google.auth.OAuth2 (
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

export const scopes = [
  'openid',
  'gmail',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail',
];
