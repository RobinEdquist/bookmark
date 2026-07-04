export interface AudnexusPerson {
  asin?: string;
  name: string;
}

export interface AudnexusGenre {
  asin?: string;
  name: string;
  type: 'genre' | 'tag';
}

export interface AudnexusSeries {
  asin?: string;
  name: string;
  position?: string;
}

export interface AudnexusBookResponse {
  asin: string;
  title: string;
  subtitle?: string;
  authors?: AudnexusPerson[];
  narrators?: AudnexusPerson[];
  description?: string;
  summary?: string;
  genres?: AudnexusGenre[];
  seriesPrimary?: AudnexusSeries;
  seriesSecondary?: AudnexusSeries;
  publisherName?: string;
  releaseDate?: string;
  isbn?: string;
  language?: string;
  image?: string;
  runtimeLengthMin?: number;
  formatType?: string;
  region?: string;
}

// Transformed response for frontend
export interface AudnexusBookDetail {
  asin: string;
  title: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  narrators: string[];
  publisher?: string;
  releaseDate?: string;
  isbn?: string;
  language?: string;
  genres: string[];
  tags: string[];
  series: { name: string; position?: string }[];
  coverUrl?: string;
}
