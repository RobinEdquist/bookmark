export interface ItunesRawResult {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  trackId?: number;
  artistName?: string;
  collectionName?: string;
  trackName?: string;
  description?: string;
  primaryGenreName?: string;
  genres?: string[];
  releaseDate?: string;
  artworkUrl100?: string;
  artworkUrl600?: string;
}

export interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesRawResult[];
}

// Transformed response for frontend
export interface ItunesSearchResult {
  id: number;
  title: string;
  author?: string;
  description?: string;
  genres: string[];
  releaseDate?: string;
  coverUrl?: string;
}
