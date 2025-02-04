# Agent Travel Explorer

A travel planning assistant that helps users plan theirtrips. Built with Vercel AI SDK, Orama AI SDK, Mistral AI, and RapidAPI integration for comprehensive travel recommendations and flight search capabilities.

## Features

- **LLM**: Utilizes Mistral AI model for natural language processing.
- **Country Information**: Powered by Orama AI SDK to provide detailed information about countries and their attractions
- **Flight Search**: Integrated with RapidAPI for real-time flight search capabilities
- **Framework**: Uses Vercel AI SDK for agent and tool integration


## Technologies Used
- Vercel AI SDK
- Orama AI SDK
- Mistral AI Model
- RapidAPI Integration

## Prerequisites

Before running this project, make sure you have:

- Node.js (latest LTS version)
- Vite
- React
- npm or yarn package manager
- API keys for:
  - RapidAPI
  - Orama API
  - Relevant AI model access tokens

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd travel_explorer
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Create a `.env` file in the root directory and add your API keys:
```
VITE_ORAMA_API_URL= your_api_url //your api url of your deployed index
VITE_ORAMA_API_KEY=your_api_key
AI_SDK_API_KEY=your_api_key
VITE_MISTRAL_API_KEY=your_api_key
VITE_RAPIDAPI_KEY=your_api_key
```

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Access the application through your web browser at `http://localhost:5173`


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Vercel for providing the AI SDK
- Orama for providing the AI SDK
- RapidAPI for flight search capabilities
