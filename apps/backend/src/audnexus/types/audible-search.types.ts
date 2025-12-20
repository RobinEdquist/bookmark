export interface AudibleAuthor {
  asin?: string;
  name: string;
}

export interface AudibleNarrator {
  name: string;
}

export interface AudibleProductImages {
  500?: string;
  1024?: string;
}

export interface AudibleProduct {
  asin: string;
  title: string;
  subtitle?: string;
  authors: AudibleAuthor[];
  narrators?: AudibleNarrator[];
  publisher_name?: string;
  product_images?: AudibleProductImages;
  runtime_length_min?: number;
  release_date?: string;
  language?: string;
}

export interface AudibleSearchResponse {
  products: AudibleProduct[];
  total_results: number;
}

// Transformed response for frontend
export interface AudibleSearchResult {
  asin: string;
  title: string;
  subtitle?: string;
  authors: string[];
  narrators: string[];
  coverUrl?: string;
  durationMinutes?: number;
  releaseDate?: string;
  language?: string;
  publisher?: string;
}
