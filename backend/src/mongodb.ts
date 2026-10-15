import { MongoClient, Db } from 'mongodb';

let connectPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!connectPromise) {
    const uri = process.env['MONGODB_URI'];
    if (!uri) {
      return Promise.reject(new Error('MONGODB_URI não configurada (veja backend/.env.example).'));
    }
    const client = new MongoClient(uri);
    connectPromise = client.connect().then(() => client.db('onde-assistir'));
  }
  return connectPromise;
}
