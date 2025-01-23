import { createMistral } from '@ai-sdk/mistral';
import { generateText, tool, streamText } from 'ai';
import { z } from 'zod';
import { createOramaProvider } from './oramaProvider';

const MISTRAL_API_KEY = 'gXjXGEaRQJKMCeD7JjCfoNed4bqP59uU';

const mistralProvider = createMistral({
  apiKey: MISTRAL_API_KEY
});

interface TravelContext {
  stage: 'initial' | 'destination_search' | 'location_confirmed' | 'dates_needed' | 'flights_search';
  selectedDestination?: string;
  fromLocation?: string;
  dates?: {
    departure?: string;
    return?: string;
  };
}

const searchTool = tool({
  description: 'Search for travel destinations and attractions',
  parameters: z.object({
    query: z.string(),
    type: z.enum(['destination', 'attraction'])
  }),
  execute: async ({ query, type }) => {
    const provider = createOramaProvider();
    const response = await streamText({
      model: provider.ask(),
      prompt: `Find ${type === 'destination' ? 'destinations matching' : 'attractions in'} ${query}`,
      temperature: 0
    });

    let result = '';
    try {
      for await (const chunk of response.textStream) {
        try {
          const text = chunk.toString();
          const event = text.split('data: ')[1];
          if (event) {
            const parsed = JSON.parse(event);
            if (parsed.type === 'text' && parsed.message) {
              result += parsed.message;
            }
          }
        } catch (e) {
          console.warn('Error parsing chunk:', e);
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
    }

    return {
      type,
      query,
      result: type === 'destination' 
        ? `Here are some destinations that match your search:\n\n${result}\n\nWhere will you be traveling from?`
        : `Here are some attractions in ${query}:\n\n${result}`
    };
  }
});

const flightTool = tool({
  description: 'Search for flights between cities',
  parameters: z.object({
    fromCity: z.string(),
    toCity: z.string(),
    dates: z.object({
      departure: z.string().optional(),
      return: z.string().optional()
    }).optional()
  }),
  execute: async ({ fromCity, toCity, dates }) => {
    return {
      flights: [{ from: fromCity, to: toCity, price: Math.floor(Math.random() * 1000) + 200 }]
    };
  }
});

export async function processUserMessage(userInput: string, context: TravelContext, onChunk?: (chunk: string) => void) {
  const { text, steps } = await generateText({
    model: mistralProvider('mistral-large-latest', { 
      structuredOutputs: true 
    }),
    tools: {
      search: searchTool,
      checkFlights: flightTool
    },
    maxSteps: 5,
    system: `You are a travel agent helping users plan their trips. Ask follow-up questions based on context:
    - If no destination: Ask about travel preferences and suggest destinations
    - If destination but no departure: Ask for departure city
    - If destination and departure: Ask for travel dates
    - If all info available: Search flights
    Current context: ${JSON.stringify(context)}`,
    prompt: userInput,
    onStepFinish: ({ text }) => {
      if (onChunk && text) {
        onChunk(text);
      }
    }
  });

  return { text, steps };
}