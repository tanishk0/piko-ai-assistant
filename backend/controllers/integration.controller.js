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

