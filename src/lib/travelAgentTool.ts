import { createMistral } from '@ai-sdk/mistral';
import { generateText, tool, streamText } from 'ai';
import { z } from 'zod';
import { createOramaProvider } from './oramaProvider';

const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;
if (!MISTRAL_API_KEY) {
  throw new Error('MISTRAL_API_KEY environment variable is not set');
}

const mistralProvider = createMistral({
  apiKey: MISTRAL_API_KEY
});

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface TravelContext {
  stage: 'initial' | 'destination_search' | 'confirm_destination' | 'departure_city' | 'dates_input' | 'flights_search';
  searchResults?: string;
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

async function determineIntent(input: string): Promise<{
  type: 'search_destination' | 'select_destination' | 'provide_location' | 'provide_dates';
  data: {
    destination?: string;
    location?: string;
    dates?: {
      departure?: string;
      return?: string;
    };
  };
}> {
  const response = await generateText({
    model: mistralProvider('mistral-large-latest'),
    prompt: `Analyze: "${input}"
Return a JSON object (you can use markdown formatting) that follows this format:
{
  "type": "search_destination" | "select_destination" | "provide_location" | "provide_dates",
  "data": {
    "destination": "extracted place",
    "location": "extracted location",
    "dates": {"departure": "YYYY-MM-DD", "return": "YYYY-MM-DD"}
  }
}

For date analysis:
- When user mentions flexible dates, calculate appropriate date range
- For "2 weeks in May" → Calculate dates for a 2-week period in May of the current/next year
- For month mentions → Use 1st of the month as default start
- For duration mentions (e.g., "5 days", "one week") → Calculate end date based on duration
- Always ensure dates are in the future
- Convert all date references to YYYY-MM-DD format

Current date: ${formatDate(new Date())}

Examples:
- "2 weeks in may" → Calculate a 14-day period starting May 1st of next available May
- "flexible in december" → Use December 1st as start date with 14 days default duration
- "5 days next month" → Calculate based on 1st of next month
- "one week starting may 1st" → Calculate exact 7-day period
- "may 15-30" → Use exact dates provided

Remember:
1. If current month is after mentioned month, use next year
2. Always ensure dates are in the future
3. For flexible dates, default to 14 days duration
4. Convert all dates to YYYY-MM-DD format`
  });
  
  console.log('Intent Analysis Response:', response.text.trim());
  
  try {
    const jsonMatch = response.text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : response.text.trim();
    
    const parsed = JSON.parse(jsonString);
    console.log('Parsed Intent:', parsed);
    
    // Validate and adjust dates if necessary
    if (parsed.type === 'provide_dates' && parsed.data.dates) {
      const today = new Date();
      const departure = new Date(parsed.data.dates.departure);
      
      // If dates are in the past, adjust to next year
      if (departure < today) {
        departure.setFullYear(departure.getFullYear() + 1);
        parsed.data.dates.departure = formatDate(departure);
        
        // Adjust return date if provided
        if (parsed.data.dates.return) {
          const returnDate = new Date(parsed.data.dates.return);
          returnDate.setFullYear(departure.getFullYear());
          parsed.data.dates.return = formatDate(returnDate);
        }
      }
    }
    
    return parsed;
  } catch (e) {
    console.error('Intent parsing error:', e);
    return { 
      type: input.toLowerCase().includes('like') || 
            input.toLowerCase().includes('yes') || 
            input.toLowerCase().includes('lets try') 
        ? 'select_destination' 
        : input.toLowerCase().includes('week') || 
          input.toLowerCase().includes('day') || 
          input.toLowerCase().includes('month') ||
          /\d{1,2}\/\d{1,2}/.test(input)
        ? 'provide_dates'
        : 'search_destination',
      data: {} 
    };
  }
}

const createSystemPrompt = (context: TravelContext) => {
  const basePrompt = `You are a helpful travel agent assistant. That go fetch information for destinations and attractions. and flights, so conversation should be focused on getting the user to the point where they can provide the information you need. Current stage: ${context.stage}

  Current Information:
  ${context.selectedDestination ? `Selected destination: ${context.selectedDestination}` : 'No destination selected'}
  ${context.fromLocation ? `Departure city: ${context.fromLocation}` : 'No departure city provided'}
  ${context.dates ? `Travel dates: ${JSON.stringify(context.dates)}` : 'No dates provided'}

  Important Rules:
  - Never ask for information that has already been provided
  - If user provides information for a future stage, store it and continue with the current stage
  - Always check context.fromLocation before asking for departure city
  - Acknowledge received information before moving to next question

  Follow these steps based on the current stage:

  1. Initial & Destination Search (${context.stage === 'initial' || context.stage === 'destination_search' ? 'CURRENT' : 'COMPLETED'}):
    - When user mentions a destination, use search tool to find options
    - Present options clearly and ask for confirmation
    - this should be the first stage of the conversation only unless user asks for a specific destination change try to use context to understand the users needs

  2. Confirm Destination (${context.stage === 'confirm_destination' ? 'CURRENT' : context.stage === 'initial' || context.stage === 'destination_search' ? 'PENDING' : 'COMPLETED'}):
    - DO NOT search again, just confirm the destination
    - When confirmed, ask for departure city ONLY if not already provided
    - If user is unsure, help them explore more options

  3. Departure City (${context.stage === 'departure_city' ? 'CURRENT' : context.stage === 'confirm_destination' || context.stage === 'initial' ? 'PENDING' : 'COMPLETED'}):
    - ONLY ask for departure city if context.fromLocation is empty
    - If departure city is already provided, move directly to dates
    - Validate city and store it

  4. Travel Dates (${context.stage === 'dates_input' ? 'CURRENT' : context.stage === 'departure_city' || context.stage === 'initial' ? 'PENDING' : 'COMPLETED'}):
    - Request preferred travel dates
    - Validate dates are in the future

  5. Flight Search (${context.stage === 'flights_search' ? 'CURRENT' : 'PENDING'}):
    - Search available flights using flightTool
    - Present options clearly`;

  switch (context.stage) {
    case 'initial':
      return basePrompt + '\n\nAsk the user about their desired destination.';
    
    case 'destination_search':
      return basePrompt + '\n\nPresent search results and ask for confirmation.';
    
    case 'confirm_destination':
      return basePrompt + '\n\nConfirm if user is satisfied with the destination.';
    
    case 'departure_city':
      return basePrompt + '\n\nAsk for departure city ONLY if not already provided.';
    
    case 'dates_input':
      return basePrompt + '\n\nRequest travel dates.';
    
    case 'flights_search':
      return basePrompt + '\n\nSearch and present flight options.';
    
    default:
      return basePrompt;
  }
};


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
        messages: [{ 
          role: 'user', 
          content: query
        }],
        maxTokens: 4000
      });

      let result = '';
      for await (const chunk of response.textStream) {
        if (result.length + chunk.length <= 13000) {
          result += chunk;
        } else {
          break;
        }
      }
      
      return {
        type,
        query,
        result: result.length > 8000 ? result.substring(0, 8000) + '...' : result
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

      // Use provided dates or fallback to tomorrow
      let departureDate = dates?.departure;
      
      if (!departureDate) {
        // Only fallback to tomorrow if no date is provided
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        departureDate = formatDate(tomorrow);
      }

      console.log('Using departure date:', departureDate);

      const url = `https://google-flights2.p.rapidapi.com/api/v1/searchFlights?departure_id=${departureAirport.code}&arrival_id=${arrivalAirport.code}&travel_class=ECONOMY&adults=1&show_hidden=1&currency=USD&language_code=en-US&country_code=US&outbound_date=${departureDate}`;
      
      console.log('Searching flights for date:', departureDate); // Debug log

      const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
      if (!RAPIDAPI_KEY) {
        throw new Error('RAPIDAPI_KEY environment variable is not set');
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': import.meta.env.VITE_RAPIDAPI_KEY,
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

  // Get intent first
  const intentResult = await determineIntent(userInput);
  
  console.log('Current Stage:', context.stage);
  console.log('Detected Intent:', intentResult);
  
  // Store information regardless of stage
  if (intentResult.type === 'select_destination' && intentResult.data.destination) {
    updatedContext.selectedDestination = intentResult.data.destination;
  }
  if (intentResult.type === 'provide_location' && intentResult.data.location) {
    updatedContext.fromLocation = intentResult.data.location;
  }
  if (intentResult.type === 'provide_dates' && intentResult.data.dates?.departure) {
    updatedContext.dates = intentResult.data.dates;
  }

  // Update stage transitions logic
  if (context.stage === 'initial') {
    if (intentResult.type === 'search_destination') {
      console.log('Transitioning from initial to destination_search');
      updatedContext.stage = 'destination_search';
    } else if (intentResult.type === 'select_destination') {
      console.log('Transitioning from initial to confirm_destination');
      updatedContext.stage = 'confirm_destination';
    }
  }
  else if (context.stage === 'destination_search' && intentResult.type === 'select_destination') {
    console.log('Transitioning from destination_search to confirm_destination');
    updatedContext.stage = 'confirm_destination';
  }
  else if (context.stage === 'confirm_destination' && intentResult.type === 'select_destination') {
    console.log('Transitioning from confirm_destination to departure_city');
    updatedContext.stage = 'departure_city';
  }
  else if (context.stage === 'departure_city' && intentResult.type === 'provide_location') {
    console.log('Transitioning from departure_city to dates_input');
    updatedContext.stage = 'dates_input';
  }
  else if (context.stage === 'dates_input' && intentResult.type === 'provide_dates') {
    if (intentResult.data.dates?.departure) {
      console.log('Transitioning from dates_input to flights_search');
      updatedContext.stage = 'flights_search';
    }
  }

  // Only move to flights_search if we have ALL required information
  const hasValidDates = updatedContext.dates?.departure && 
                       new Date(updatedContext.dates.departure).getTime() > new Date().getTime();

  // Instead, ensure proper stage progression
  if (updatedContext.selectedDestination && !updatedContext.fromLocation) {
    updatedContext.stage = 'departure_city';
  } else if (updatedContext.selectedDestination && updatedContext.fromLocation && !hasValidDates) {
    updatedContext.stage = 'dates_input';
  }

  console.log('Updated Stage:', updatedContext.stage);
  console.log('Updated Context:', updatedContext);

  const { text, steps } = await generateText({
    model: mistralProvider('mistral-large-latest', { structuredOutputs: true }),
    tools: { search: searchTool, checkFlights: flightTool },
    maxSteps: 5,
    system: createSystemPrompt(updatedContext),
    prompt: userInput,
    onStepFinish: ({ text }) => {
      if (onChunk) onChunk(text);
    }
  });

  return { text, steps, updatedContext };
}
