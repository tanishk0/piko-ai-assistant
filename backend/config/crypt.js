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

export const decrypt = value => {
  const {iv, tag, data} = value.split (':');
  if (!iv || !tag || !data) {
    throw new Error ('Invalid encrypted value');
  }

  const decipher = crypto.createDecipheriv (
    'aes-256-gcm',
    getKey (),
    Buffer.from (iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final()
]).toString('utf-8')
};
