import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { Send, Globe, Star } from 'lucide-react';
import type { Message } from './types';
import { processUserMessage } from './lib/travelAgentTool';
import { FlightResults } from './components/FlightResults';

function App() {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hi! I'm your AI travel agent. I can help you plan your perfect trip. Where would you like to go?",
      sender: 'bot',
      timestamp: new Date(),
      suggestions: ['Popular Destinations', 'Beach Vacation', 'Cultural Experience']
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [context, setContext] = useState<TravelContext>({
    stage: 'initial'
  });

  const handleMessage = async (userInput: string) => {
    try {
      setIsLoading(true);
      const newUserMessage = {
        id: messages.length + 1,
        text: userInput,
        sender: 'user',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newUserMessage]);
  
      const result = await processUserMessage(userInput, context, (chunk) => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: chunk,
          sender: 'bot',
          timestamp: new Date()
        }]);
      });
  
      setContext(result.updatedContext);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        text: "Sorry, I encountered an error. Please try again.",
        sender: 'bot',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (inputText.trim()) {
      handleMessage(inputText);
      setInputText('');
    }
  };


  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Travel Explorer
          </h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Popular Destinations */}
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Star className="w-4 h-4" />
                Popular Destinations
              </h3>
              <div className="space-y-2">
                {['Tokyo', 'Paris', 'New York', 'London', 'Hong Kong'].map((city) => (
                  <div
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedCity === city
                        ? 'bg-blue-50 text-blue-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">{city}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <Separator />

            {/* Regions */}
            <div>
              <h3 className="font-semibold mb-2">Regions</h3>
              <div className="space-y-1">
                {['Asia', 'Europe', 'North America', 'South America', 'Africa', 'Oceania'].map((region) => (
                  <div
                    key={region}
                    className="text-sm p-2 hover:bg-gray-100 rounded cursor-pointer"
                  >
                    {region}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Travel Categories */}
            <div>
              <h3 className="font-semibold mb-2">Travel Styles</h3>
              <div className="space-y-1">
                {[
                  'Beach Getaways',
                  'Cultural Experiences',
                  'Adventure Travel',
                  'City Breaks',
                  'Luxury Travel'
                ].map((category) => (
                  <div
                    key={category}
                    className="text-sm p-2 hover:bg-gray-100 rounded cursor-pointer"
                  >
                    {category}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto w-full">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-lg p-4 max-w-[80%] ${
                    message.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white shadow-sm border border-gray-200'
                  }`}
                >
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown 
                      components={{
                        p: ({children}) => <p className="m-0">{children}</p>
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                    {message.flights && <FlightResults flights={message.flights} />}
                  </div>
                  {message.suggestions && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleMessage(suggestion)}
                          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  {message.isLoading && (
                    <div className="mt-2 flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex gap-4 max-w-3xl mx-auto">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
              placeholder="Ask me anything about your travel plans..."
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className={`${
                isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              } text-white p-2 rounded-lg transition-colors`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;