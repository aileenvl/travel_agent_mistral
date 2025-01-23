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

interface FlightData {
  departure_time: string;
  arrival_time: string;
  duration: {
    raw: number;
    text: string;
  };
  flights: {
    departure_airport: {
      airport_name: string;
      airport_code: string;
      time: string;
    };
    arrival_airport: {
      airport_name: string;
      airport_code: string;
      time: string;
    };
    airline: string;
    airline_logo: string;
    flight_number: string;
    aircraft: string;
    seat: string;
    legroom: string;
  }[];
  price: number;
  stops: number;
  airline_logo: string;
}

const createSystemPrompt = (context: TravelContext) => `You are a helpful travel agent assistant. Follow these steps in order:

1. When a user mentions a general region (like "Asia", "Europe", etc.):
   - Use the search tool with type "destination" to show specific popular destinations in that region
   - Ask them to choose a specific city/destination from the list

2. When the user provides their departure city:
   - Store it and acknowledge it
   - If they haven't chosen a specific destination yet, remind them to choose one
   - If they have a destination AND departure city, proceed to ask for travel dates
   - Once you have dates, use the flightTool to search for available flights

3. When you have departure city and destination:
   - Ask for their preferred travel dates
   - Once you have dates, use the flightTool to search for available flights
   - Present the options clearly

Remember:
- Keep track of what information you have and what you still need
- Don't show destination options again once a specific destination is chosen
- Don't search for flights until you have both cities and dates
- Be clear and concise in your responses

Current context:
Stage: ${context.stage}
Selected destination: ${context.selectedDestination || 'none'}
From location: ${context.fromLocation || 'none'}
Dates: ${context.dates ? JSON.stringify(context.dates) : 'none'}`;

const searchTool = tool({
  description: 'Search for travel destinations and attractions',
  parameters: z.object({
    query: z.string(),
    type: z.enum(['destination', 'attraction'])
  }),
  execute: async ({ query, type }) => {
    if (type === 'destination') {
      const provider = createOramaProvider();
      const response = await streamText({
        model: provider.ask(),
        prompt: `List 4-5 popular destinations in ${query} with a brief description of each. Focus on major cities that have international airports.`,
        temperature: 0
      });

      let result = '';
      for await (const chunk of response.textStream) {
        result += chunk;
      }
      
      return {
        type,
        query,
        result: `Here are some popular destinations in ${query}:\n\n${result}\n\nWhich destination interests you? Please choose a specific city from the list.`
      };
    } else {
      return {
        type,
        query,
        result: `Here are some attractions in ${query}:\n\n[Attractions would be listed here]`
      };
    }
  }
});

const formatFlightResults = (data: any) => {
  if (!data?.data?.itineraries?.topFlights?.length) {
    return [];
  }

  // First, separate flights by destination airport
  const flightsByDestination: { [key: string]: any[] } = {};
  
  data.data.itineraries.topFlights.forEach((flight: any) => {
    const destAirport = flight.flights[0].arrival_airport;
    const key = `${destAirport.airport_name} (${destAirport.airport_code})`;
    
    if (!flightsByDestination[key]) {
      flightsByDestination[key] = [];
    }
    
    flightsByDestination[key].push({
      airline: flight.flights[0].airline,
      flightNumber: flight.flights[0].flight_number,
      departure: {
        time: flight.departure_time,
        airport: flight.flights[0].departure_airport.airport_code
      },
      arrival: {
        time: flight.arrival_time,
        airport: destAirport.airport_code
      },
      duration: flight.duration.text,
      price: flight.price,
      stops: flight.flights.length - 1,
      aircraft: flight.flights[0].aircraft
    });
  });

  // Format the message with proper sections
  let formattedMessage = "Here are some flight options:\n\n";
  
  Object.entries(flightsByDestination).forEach(([destination, flights]) => {
    formattedMessage += `Flights to ${destination}:\n\n`;
    
    flights.forEach(flight => {
      formattedMessage += `${flight.airline} Flight ${flight.flightNumber}\n`;
      formattedMessage += `• Departure: ${flight.departure.time} from ${flight.departure.airport}\n`;
      formattedMessage += `• Arrival: ${flight.arrival.time} at ${flight.arrival.airport}\n`;
      formattedMessage += `• Duration: ${flight.duration}\n`;
      formattedMessage += `• Price: $${flight.price}\n`;
      formattedMessage += `• Aircraft: ${flight.aircraft}\n`;
      formattedMessage += `• ${flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}\n`;
      formattedMessage += `\n`;
    });
  });

  return {
    flights: Object.values(flightsByDestination).flat(),
    formattedMessage: formattedMessage.trim()
  };
};

const resolveAirportCode = tool({
  description: 'Resolve city name to primary airport code',
  parameters: z.object({
    cityName: z.string(),
    context: z.string().optional() // 'departure' or 'arrival'
  }),
  execute: async ({ cityName, context = 'departure' }) => {
    // Common airport codes mapping for quick resolution
    const commonAirports: { [key: string]: string } = {
      'los angeles': 'LAX',
      'new york': 'JFK',
      'tokyo': 'NRT',
      'london': 'LHR',
      'paris': 'CDG',
      'beijing': 'PEK',
      'shanghai': 'PVG',
      'hong kong': 'HKG',
      'seoul': 'ICN',
      'singapore': 'SIN',
      'sydney': 'SYD',
      'dubai': 'DXB',
      'osaka': 'KIX',
      'san francisco': 'SFO',
      'chicago': 'ORD',
      'miami': 'MIA'
    };

    // Try to find in common airports first
    const normalizedCity = cityName.toLowerCase().trim();
    if (commonAirports[normalizedCity]) {
      return {
        code: commonAirports[normalizedCity],
        city: cityName
      };
    }

    // If not found in common airports, use LLM to resolve
    try {
      const response = await generateText({
        model: mistralProvider('mistral-large-latest'),
        prompt: `Given the city name "${cityName}", what is the primary international airport code for ${context === 'departure' ? 'departing from' : 'arriving in'} this city? Respond with only the 3-letter IATA airport code. If unsure, respond with "UNKNOWN".`
      });
      
      const airportCode = response.text.trim().slice(0, 3).toUpperCase();
      
      if (airportCode === "UNK" || !airportCode.match(/^[A-Z]{3}$/)) {
        throw new Error(`Could not resolve airport code for ${cityName}`);
      }

      return {
        code: airportCode,
        city: cityName
      };
    } catch (error) {
      console.error('Airport code resolution error:', error);
      throw new Error(`Could not resolve airport code for ${cityName}. Please provide the airport code directly (e.g., LAX, NRT).`);
    }
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
    try {
      // Resolve airport codes
      let departureAirport, arrivalAirport;
      try {
        departureAirport = await resolveAirportCode.execute({ 
          cityName: fromCity, 
          context: 'departure' 
        });
        arrivalAirport = await resolveAirportCode.execute({ 
          cityName: toCity, 
          context: 'arrival' 
        });
      } catch (error) {
        return {
          flights: [],
          message: error.message
        };
      }

      // Get current date and add one day to ensure future date
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Format date as YYYY-MM-DD and ensure it's in the future
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      let departureDate = dates?.departure;
      
      // If no date provided or date is in the past, use tomorrow
      if (!departureDate) {
        departureDate = formatDate(tomorrow);
      } else {
        const providedDate = new Date(departureDate);
        if (providedDate < today) {
          departureDate = formatDate(tomorrow);
        }
      }

      const url = `https://google-flights2.p.rapidapi.com/api/v1/searchFlights?departure_id=${departureAirport.code}&arrival_id=${arrivalAirport.code}&travel_class=ECONOMY&adults=1&show_hidden=1&currency=USD&language_code=en-US&country_code=US&outbound_date=${departureDate}`;
      
      console.log('Searching flights for date:', departureDate); // Debug log

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': 'JTzTR1qV6YmshqkZM7AwowYltbZNp19GgZGjsn5dX7IDppQ1Rz',
          'x-rapidapi-host': 'google-flights2.p.rapidapi.com'
        }
      });

      const data = await response.json();
      
      if (!data.status) {
        return {
          flights: [],
          message: `Error: ${data.message?.[0]?.outbound_date || 'No flights found'}`
        };
      }

      const { flights, formattedMessage } = formatFlightResults(data);

      if (flights.length === 0) {
        return {
          flights: [],
          message: `No flights found from ${departureAirport.city} (${departureAirport.code}) to ${arrivalAirport.city} (${arrivalAirport.code}) for ${departureDate}`
        };
      }

      return {
        flights,
        message: formattedMessage
      };
    } catch (error) {
      console.error('Flight search error:', error);
      return {
        flights: [],
        message: 'Sorry, there was an error searching for flights. Please try again.'
      };
    }
  }
});

export async function processUserMessage(userInput: string, context: TravelContext, onChunk?: (chunk: string) => void) {
  let updatedContext = { ...context };
  const input = userInput.toLowerCase();

  // Handle initial region search
  if (context.stage === 'initial' && input.includes('to')) {
    const destination = input.split('to').pop()?.trim();
    if (destination) {
      updatedContext.stage = 'destination_search';
    }
  } 
  // Handle destination selection from the list
  else if (context.stage === 'destination_search' && !updatedContext.selectedDestination) {
    updatedContext.selectedDestination = userInput.trim();
    updatedContext.stage = 'location_confirmed';
  }
  // Handle departure city input
  else if (context.stage === 'location_confirmed' && input.includes('from')) {
    updatedContext.fromLocation = input.replace('from', '').trim();
    // If we have both destination and departure, move to dates
    if (updatedContext.selectedDestination) {
      updatedContext.stage = 'dates_needed';
    }
  }

  const { text, steps } = await generateText({
    model: mistralProvider('mistral-large-latest', { 
      structuredOutputs: true 
    }),
    tools: {
      search: searchTool,
      checkFlights: flightTool
    },
    maxSteps: 5,
    system: createSystemPrompt(updatedContext),
    prompt: userInput,
    onStepFinish: ({ text }) => {
      if (onChunk && text) {
        onChunk(text);
      }
    }
  });

  return { text, steps, updatedContext };
}