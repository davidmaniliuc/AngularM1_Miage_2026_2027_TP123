export interface GameInput {
  title: string;
  description?: string | null;
  region?: string | null;
  releaseYear?: number | null;
}

export interface Game extends GameInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}
