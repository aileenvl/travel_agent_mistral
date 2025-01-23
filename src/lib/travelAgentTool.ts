import { createMistral } from '@ai-sdk/mistral';
import { generateText, tool, streamText } from 'ai';
import { z } from 'zod';
import { createOramaProvider } from './oramaProvider';

const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;

const mistralProvider = createMistral({
  apiKey: MISTRAL_API_KEY
});

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
          // Handle both JSON and plain text responses
          if (text.startsWith('data: ')) {
            const event = text.split('data: ')[1];
            try {
              const parsed = JSON.parse(event);
              if (parsed.type === 'text' && parsed.message) {
                result += parsed.message;
              }
            } catch {
              // If JSON parsing fails, treat it as plain text
              result += event.trim();
            }
          } else {
            // Handle plain text responses
            result += text.trim();
          }
        } catch (e) {
          console.warn('Error processing chunk:', e);
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
      throw new Error(`Failed to process search results: ${e.message}`);
    }

    return {
      type,
      query,
      result: type === 'destination' 
        ? `Here are some destinations that match your search:\n\n${result}`
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

export async function processUserMessage(userInput: string, context: any, onChunk?: (chunk: string) => void) {
  const { text, steps } = await generateText({
    model: mistralProvider('mistral-large-latest', { 
      structuredOutputs: true 
    }),
    tools: {
      search: searchTool,
      checkFlights: flightTool
    },
    maxSteps: 5,
    system: `You are a travel agent helping users plan their trips. Current context: ${JSON.stringify(context)}`,
    prompt: userInput,
    onStepFinish: ({ text }) => {
      if (onChunk && text) {
        onChunk(text);
      }
    }
  });

  return { text, steps };
}