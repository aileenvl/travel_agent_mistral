import React from 'react';

interface Flight {
  from: string;
  to: string;
  airline: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  stops: number;
  airline_logo: string;
}

interface FlightResultsProps {
  flights: Flight[];
}

export const FlightResults: React.FC<FlightResultsProps> = ({ flights }) => {
  return (
    <div className="space-y-4">
      {flights.map((flight, index) => (
        <div key={index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img src={flight.airline_logo} alt={flight.airline} className="h-8 w-8 object-contain" />
              <div>
                <div className="font-medium">{flight.airline}</div>
                <div className="text-sm text-gray-500">{flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</div>
              </div>
            </div>
            <div className="text-lg font-semibold">${flight.price}</div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="text-center">
              <div className="text-lg font-medium">{flight.departure.split(' ')[1]}</div>
              <div className="text-sm text-gray-500">{flight.from}</div>
            </div>
            
            <div className="flex-1 px-4">
              <div className="text-sm text-gray-500 text-center">{flight.duration}</div>
              <div className="relative">
                <div className="border-t border-gray-300 my-2"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-300 rounded-full"></div>
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-lg font-medium">{flight.arrival.split(' ')[1]}</div>
              <div className="text-sm text-gray-500">{flight.to}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}; 