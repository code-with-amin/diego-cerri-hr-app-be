// Vercel serverless entrypoint.
//
// On Vercel the app runs as a serverless function — there is no long-lived
// `app.listen()`. We export the Express app instance and let Vercel's Node
// runtime invoke it as the request handler. Local dev still uses src/index.ts.
import { createApp } from '../src/app';

const app = createApp();

export default app;
