import { oramaProvider } from '@oramacloud/ai-sdk-provider';
import { streamText } from 'ai';

export interface SearchResult {
  name: string;
  description: string;
  type: 'city' | 'attraction';
  score: number;
}

export function createOramaProvider() {
  return {
    search: async (query: string): Promise<SearchResult[]> => {
      const provider = oramaProvider({
        endpoint: import.meta.env.VITE_ORAMA_API_URL as string,
        apiKey: import.meta.env.VITE_ORAMA_API_KEY as string,
        userContext: "The user is looking for travel recommendations",
        inferenceType: "documentation",
        searchMode: "fulltext",
        searchOptions: {
          limit: 5
        }
      });

      const response = await streamText({
        model: provider.ask(),
        prompt: query,
        temperature: 0
      });

      console.log(response);
      return response.hits.map(hit => ({
        name: hit.document.name as string,
        description: hit.document.description as string,
        type: hit.document.type as 'city' | 'attraction',
        score: hit.score
      }));
    },

    ask: () => {
      return oramaProvider({
        endpoint: import.meta.env.VITE_ORAMA_API_URL as string,
        apiKey: import.meta.env.VITE_ORAMA_API_KEY as string,
        userContext: "The user is looking for travel recommendations",
        inferenceType: "documentation"
      }).ask();
    }
  };
} 