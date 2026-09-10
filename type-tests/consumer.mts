import { suggest } from '../index.js';
const result = await suggest('root', { forwardOnly: true, forwardConnections: async id => [id] });
const score: number | undefined = result[0]?.score;
suggest('root', { forwardOnly: true, forwardConnections: (id, cb) => cb(null, [id]) }, (error, results) => {
  const id: string | undefined = results?.[0]?.nodeID;
});
