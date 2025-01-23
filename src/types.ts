export interface City {
  rank: number;
  city: string;
  country: string;
  arrivals: {
    [year: string]: number;
  };
  growth: {
    [year: string]: number;
  };
  attractions: Attraction[];
}

export interface Attraction {
  name: string;
  rating: number;
  review_count: number;
  category: string;
  attributes: string;
  location?: {
    longitude: number;
    latitude: number;
  };
  photo_url: string;
}

export interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  suggestions?: string[];
}