export interface Suggestion {
  nodeID: string;
  score: number;
}
export type ConnectionCallback = (error: Error | null, connections?: string[]) => void;
export type ConnectionFetcher =
  (nodeID: string, callback: ConnectionCallback) => void | Promise<string[]>;
export interface Options {
  forwardConnections: ConnectionFetcher;
  reverseConnections?: ConnectionFetcher;
  forwardOnly?: boolean;
  maxResults?: number;
  iterations?: number;
  alpha?: number;
  concurrency?: number;
}
export function suggest(nodeID: string, options: Options): Promise<Suggestion[]>;
export function suggest(nodeID: string, options: Options,
  callback: (error: Error | null, results: Suggestion[] | null) => void): void;
