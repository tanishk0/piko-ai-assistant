import {googleOAuthclient, scopes} from '../config/googleOAuth.js';
import jwt from 'jsonwebtoken';
import {google} from 'googleapis';
import Integration from '../models/integration.model.js';
import {decrypt, encrypt} from '../config/crypt.js';
import axios from 'axios';

const getFrontendUrl = () => {
  return (process.env.FRONTEND_URL || 'http://localhost:5173')
    .replace(/['"]+/g, '')
    .replace(/\/$/, '');
};

export const connectGoogle = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign(
      {
        userId: String(userId),
        purpose: 'google-oauth',
      },
      process.env.JWT_SECRET,
      {expiresIn: '10m'}
    );
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:8000/api/integrations/google/callback';
    const url = googleOAuthclient.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      prompt: 'consent',
      redirect_uri: redirectUri,
    });
    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Google OAuth initiation failed: ${error.message || error}`,
    });
  }
};

export const googleCallback = async (req, res) => {
  const frontendUrl = getFrontendUrl();
  try {
    const {code, state, error} = req.query;
    if (error) {
      console.error('Google callback error parameter:', error);
      return res.redirect(
        `${frontendUrl}/integrations?google=error&message=${encodeURIComponent(
          error
        )}`
      );
    }
    if (!code || !state) {
      return res.redirect(
        `${frontendUrl}/integrations?google=error&message=missing_code_or_state`
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (e) {
      return res.redirect(
        `${frontendUrl}/integrations?google=error&message=invalid_oauth_state`
      );
    }

    if (decoded.purpose !== 'google-oauth' || !decoded.userId) {
      return res.redirect(
        `${frontendUrl}/integrations?google=error&message=invalid_oauth_purpose`
      );
    }

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:8000/api/integrations/google/callback';
    const {tokens} = await googleOAuthclient.getToken({
      code,
      redirect_uri: redirectUri,
    });
    googleOAuthclient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: 'v2',
      auth: googleOAuthclient,
    });

    const {data: profile} = await oauth2.userinfo.get();
    if (!profile.id || !profile.email) {
      return res.redirect(
        `${frontendUrl}/integrations?google=error&message=unable_to_identify_profile`
      );
    }

    const filter = {
      userId: decoded.userId,
      provider: 'google',
    };

    let connection = await Integration.findOne(filter).select(
      '+tokens.accessToken +tokens.refreshToken'
    );
    if (!connection) {
      connection = new Integration({
        ...filter,
        providerAccountId: profile.id,
        services: [],
        tokens: {},
      });
    }

    connection.providerAccountId = profile.id;
    connection.services = [
      ...new Set([
        ...(connection.services || []),
        'gmail',
        'google_calendar',
      ]),
    ];
    connection.account = {
      ...connection.account?.toObject?.(),
      email: profile.email,
      displayName: profile.name || '',
    };
    connection.scopes = tokens.scope ? tokens.scope.split(' ') : scopes;

    if (tokens.access_token) {
      connection.tokens.accessToken = encrypt(tokens.access_token);
    }
    if (tokens.refresh_token) {
      connection.tokens.refreshToken = encrypt(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      connection.tokens.expiresAt = new Date(tokens.expiry_date);
    }
    connection.status = 'connected';
    connection.connectedAt = new Date();
    await connection.save();

    return res.redirect(`${frontendUrl}/integrations?google=connected`);
  } catch (error) {
    console.error('Google callback exception:', error);
    return res.redirect(
      `${frontendUrl}/integrations?google=error&message=${encodeURIComponent(
        error.message || 'google_callback_error'
      )}`
    );
  }
};

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0';
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const INSTAGRAM_CONFIG_ID = process.env.INSTAGRAM_CONFIG_ID;

const INSTAGRAM_SCOPES = ['instagram_basic', 'instagram_content_publish'];

export const connectInstagram = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign(
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
      override_default_response_type: 'true',
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      response_type: 'code',
      state,
      prompt: 'login',
    });
    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`;

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Instagram OAuth failed: ${error.message || error}`,
    });
  }
};

export const instagramCallback = async (req, res) => {
  const frontendUrl = getFrontendUrl();
  try {
    const {code, state, error} = req.query;
    if (error) {
      return res.redirect(
        `${frontendUrl}/integrations?instagram=error&message=${encodeURIComponent(
          error
        )}`
      );
    }
    if (!code || !state) {
      return res.redirect(
        `${frontendUrl}/integrations?instagram=error&message=missing_code_or_state`
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (e) {
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
    const tokenResponse=await axios.get(`https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/oauth/access_token`,{
      params : {
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code,
    },
    timeout: 15000
    })
    console.log('token response', tokenResponse)
    const userAccessToken=tokenResponse.data.access_token
    const assignedAccounts = await axios.get(`https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/me/assigned_instagram_accounts`, {
      params: {
        fields: 'id, username',
        access_token: userAccessToken,
      },
      timeout: 15000,
    })
    const instagramAccounts=assignedAccounts.data.data

    if (!instagramAccounts || instagramAccounts.length === 0) {
      return res.redirect(
      `${process.env.FRONTEND_URL}/integrations?instagram=error_no_account`
    );
  }
    const dynamicAccountId=instagramAccounts[0].id
    const profile = await axios.get(`https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/${dynamicAccountId}`, {
      params: {
        fields: 'id,username,name',
        access_token: userAccessToken,
      },
      timeout: 15000,
    })
    const filter = {
      userId: decoded.userId,
      provider: 'instagram',
      providerAccountId: profile.id,
    };
    let connection = await Integration.findOne (filter).select (
      '+tokens.accessToken'
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
        'instagram',
      ]),
    ];
    connection.account={
        ...connection.account?.toObject?.(),
        username :profile.username,
        displayName: profile.name || profile.username
    }
    connection.scopes= INSTAGRAM_SCOPES

    if(tokens.access_token){
        connection.tokens.accessToken= encrypt(userAccessToken)
    }
    
    if(tokens.expiry_date){
      connection.tokens.expiresAt=null
    }
    connection.status='connected'
    connection.connectedAt=new Date()
    await connection.save()

    return res.redirect(`${process.env.FRONTEND_URL}/integrations?instagram=connected`)
  } catch (error) {
      return res.status(500).json({message: `instagram callback error ${error}`}) 
  }
}


export const getIntegrations = async(req, res) => {
  try {
    const userId=req.user._id
    const integrations = await Integration.find({userId, status: "connected"}).select('-tokens')

    const googleConnection=integrations.find((item)=>item.provider==='google')
    const instagramConnection=integrations.find((item)=>item.provider==='instagram')
    return res.status(200).json({
      success: true,
      integrations: {
        gmail: {
          connected: googleConnection?.services.includes("gmail") || "false",
          email: googleConnection?.account.email || null
        },
        google_calender: {
          connected: googleConnection?.services.includes("google_calender") || false,
          email: googleConnection?.account.email || null
        },
        instagram: {
          connected: instagramConnection?.services.includes("instagram") ||   false,
          username: instagramConnection?.account.username || null
        },

      }
    })
  } catch (error) {
    return res.status(500).json({message: `get integrations error ${error}`})
  }
}

export const disconnectGoogle = async(req, res)=> {
  try {
    const userId=req.user._id
    const connection = await Integration.findOne({
      userId, 
      provider:"google"
    })

    if(!connection){
      return res.status(400).json({message: 'google connection not found'})
    }

    await Integration.deleteOne({
      userId,
      _id: connection._id,
    })
    return res.status(200).json({message: "Google disconnected succesfully"})
  } catch (error) {
    return res.status(500).json({message: "Google disconnection failed ${error"})
  }
}

export const disconnectInstagram = async(req, res)=> {
  try {
    const userId=req.user._id
    const connection = await Integration.findOne({
      userId, 
      provider:"instagram"
    })

    if(!connection){
      return res.status(400).json({message: 'instagram connection not found'})
    }

    await Integration.deleteOne({
      userId,
      _id: connection._id,
    })
    return res.status(200).json({message: "Instagram disconnected succesfully"})
  } catch (error) {
    return res.status(500).json({message: "Instagram disconnection failed ${error"})
  }
}