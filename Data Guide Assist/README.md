# Data Guide Assist

## Run locally

Install dependencies and start both the React app and the local Excel API:

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal. Submitting a prompt appends it with a
unique ID and UTC timestamp to `data/prompts.xlsx`. Use the thumbs-up or
thumbs-down buttons under a response to share feedback. The selected rating
(`Thumbs Up` or `Thumbs Down`) is saved in the `Feedback Response` column on
that prompt's row in `data/prompts.xlsx`. Existing prompt workbooks get the
column added when needed. Keep the local API running while using the app.

The React app, API, and tests are written in TypeScript. Run `npm test` for the
Excel storage tests. The response panel is a local preview; it does not call an
AI model.
