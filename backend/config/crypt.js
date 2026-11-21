import crypto from 'crypto';

const getKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  return key;
};

export const encrypt = text => {
  const iv = crypto.randomBytes (12);
  const cipher = crypto.createCipheriv ('aes-256-gcm', getKey (), iv);
  const encrypted = Buffer.concat ([
    cipher.update (text, utf8),
    cipher.final (),
  ]);

  return [
    iv.toString ('hex'),
    cipher.getAuthTag ().toString ('hex'),
    encrypted.toString ('hex'),
  ].join (':');
};
