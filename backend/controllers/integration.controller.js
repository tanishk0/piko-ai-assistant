import {success} from 'zod';
import {googleOAuthclient, scopes} from '../config/googleOAuth.js';
import jwt from 'jsonwebtoken';
import {google} from 'googleapis';
import Integration from '../models/integration.model.js';
export const connectGoogle = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign (
      {
        userId,
        purpose: 'google-oauth',
      },
      process.env.JWT_SECRET,
      {expiresIn: '10m'}
    );
    const url = googleOAuthclient.generateAuthUrl ({
      access_type: 'offline',
      scope: scopes,
      state,
    });
    return res.status (200).json ({
      success: true,
      url,
    });
  } catch (error) {
    return res.status (500).json ({
      success: false,
      message: `google oauth failed ${error}`,
    });
  }
};

export const googleCallback = async (req, res) => {
  try {
    const {code, state, error} = req.query;
    if (error) {
      return res.status (400).json ({
        message: 'Google auth failed',
      });
    }
    const decoded = jwt.verify (state, process.env.JWT_SECRET);
    if (decoded.purpose !== 'google-oauth' || !decoded.userId) {
      return res.status (400).json ({
        message: 'invalid oauth state',
      });
    }
    const {tokens} = await googleOAuthclient.getToken (code);
    googleOAuthclient.setCredentials (tokens);
    const oauth2 = google.oauth2 ({
      version: 'v2',
      auth: googleOAuthclient,
    });

    const {data: profile} = await oauth2.userinfo.get ();
    if (!profile.id || !profile.email) {
      return res
        .status (400)
        .json ({message: 'Unable to identify google account'});
    }
    const filter = {
      userId: decoded.userId,
      provider: 'google',
      providerAccountId: profile.id,
    };
    let connection = await Integration.findOne (filter).select (
      '+tokens.accessToken.refreshToken'
    );
    if (!connection) {
      connection = new Integration ({
        ...filter,
        services: [],
        tokens: {},
      });
    }
    connection.services = [
      ...new Set ([
        ...Integration (connection.services || []),
        'gmail',
        'google_calender',
      ]),
    ];
    connection.account={
        ...connection.account?.toObject?.(),
        email:profile.email,
        displayName: profile.name || ''
    }
    connection.scopes=tokens.scope?tokens.scope.split(' ') : scopes
    if(tokens.access_token){
        connection.tokens.accessToken= tokens.access_token
    }
    if(tokens.refresh_token){
        connection.tokens.refreshToken=tokens.refresh_token
    }
  } catch (error) {}
};
