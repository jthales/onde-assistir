import { MongoClient, Db } from 'mongodb';

let connectPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!connectPromise) {
    const client = new MongoClient(process.env['MONGODB_URI']!);
    connectPromise = client.connect().then(() => client.db('onde-assistir'));
  }
  return connectPromise;
}
