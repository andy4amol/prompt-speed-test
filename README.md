# Prompt AI Interface

A Next.js application that allows users to input prompts and get AI responses with real-time progress tracking.

## Features

- **Prompt Input**: Enter your prompt in a textarea
- **AI Response**: Get real-time streaming responses from OpenAI API
- **Progress Tracking**: 
  - First token output time
  - Complete response time
  - Generation speed (tokens per second)
  - Visual progress bars for each stage
- **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # AI chat API endpoint
│   ├── globals.css           # Global styles with Tailwind
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main application page
├── .env.local                # Environment variables
├── next.config.js           # Next.js configuration
├── package.json             # Dependencies
├── postcss.config.js        # PostCSS configuration
├── tailwind.config.ts       # Tailwind CSS configuration
└── tsconfig.json            # TypeScript configuration
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

or

```bash
yarn install
```

### 2. Set Up Environment Variables

Create a `.env.local` file in the root directory and add your OpenAI API key:

```
OPENAI_API_KEY=your-openai-api-key-here
```

### 3. Run the Development Server

```bash
npm run dev
```

or

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### 4. Build for Production

```bash
npm run build
npm start
```

or

```bash
yarn build
yarn start
```

## Usage

1. Enter your prompt in the textarea
2. Click "Send Prompt" button
3. Watch the AI response stream in real-time
4. Monitor the progress tracking on the right side:
   - Start time: When you submitted the prompt
   - First token delay: Time until the first response token appears
   - Generation time: Time spent generating the full response
   - Total response time: Complete round-trip time

## Technologies Used

- **Next.js 14** with App Router
- **TypeScript**
- **Tailwind CSS**
- **AI SDK** (from Vercel) for streaming responses
- **阿里百炼 (Aliyun DashScope)** for AI completions (兼容 OpenAI API 格式)

## Progress Tracking Details

The application tracks the following metrics:

- **First Token Latency**: Time from prompt submission to first token received
- **Generation Speed**: Number of tokens generated per second
- **Total Response Time**: Complete time from submission to full response

These metrics are displayed with visual progress bars and real-time updates.

## License

MIT