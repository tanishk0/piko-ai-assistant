import {success} from 'zod';
import {googleOAuthclient, scopes} from '../config/googleOAuth.js';
import jwt from 'jsonwebtoken';
import {google} from 'googleapis';
import Integration from '../models/integration.model.js';
import { decrypt, encrypt } from '../config/crypt.js';
export const connectGoogle = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign (
      {
        userId: String(userId),
        purpose: 'google-oauth',
      },
      process.env.JWT_SECRET,
      {expiresIn: '10m'}
    );
    const url = googleOAuthclient.generateAuthUrl ({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent',
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
        connection.tokens.accessToken= encrypt(tokens.access_token)
    }
    if(tokens.refresh_token){
        connection.tokens.refreshToken=encrypt(tokens.refresh_token)
    }
    if(tokens.expiry_date){
      connection.tokens.expiresAt=new Date(tokens.expiry_date)
    }
    connection.status='connected'
    connection.connectedAt=new Date()
    await connection.save()

    return res.redirect(`${process.env.FRONTEND_URL}/integrations?google=connected`)


  } catch (error) {
    return res.status(500).json({message: `google callback error ${error}`})
  }
};
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET
const INSTAGRAM_GRAPH_VERSION= process.env.INSTAGRAM_GRAPH_VERSION
const INSTAGRAM_REDIRECT_URI=process.env.INSTAGRAM_REDIRECT_URI
const INSTAGRAM_CONFIG_ID = process.env.INSTAGRAM_CONFIG_ID

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish'
]

export const connectInstagram = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign (
      {
        userId: String(userId),
        purpose: 'instagram-oauth',
      },
      process.env.JWT_SECRET,
      {expiresIn: '10m'}
    );
    const params = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      config_id: INSTAGRAM_CONFIG_ID,
      display: 'popup',
      override_default_response_type:'true',
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      response_type: 'code',
      state,
      prompt: 'login'
    })
    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`



    return res.status (200).json ({
      success: true,
      url,
    });
  } catch (error) {
    return res.status (500).json ({
      success: false,
      message: `insta oauth failed ${error}`,
    });
  }
};


export const instagramCallback=async(req, res)=>{
  try {
    const {code, state, error} = req.query;
    if (error) {
      return res.status (400).json ({
        message: 'insta auth failed',
      });
    }
    const decoded = jwt.verify (state, process.env.JWT_SECRET);
    if (decoded.purpose !== 'instagram-oauth' || !decoded.userId) {
      return res.status (400).json ({
        message: 'invalid oauth state - instagram',
      });
    }
  } catch (error) {
    
  }
}
