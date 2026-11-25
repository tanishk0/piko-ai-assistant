import 'dotenv/config';
import mongoose from 'mongoose';

try {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection('agents');
  // Establish the owner-scoped constraint before removing the obsolete global one.
  await collection.createIndex({ userId: 1, name: 1 }, { unique: true });
  for (const index of await collection.indexes()) {
    if (index.unique && Object.keys(index.key).length === 1 && index.key.name === 1) await collection.dropIndex(index.name);
  }
  console.log('Agent names are now unique per owner.');
} finally { await mongoose.disconnect(); }
