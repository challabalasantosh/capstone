# Data Guide Assist

Data Guide Assist uses the existing React UI, Google Agent Development Kit
(ADK), Ollama's OpenAI-compatible API, and PostgreSQL. A user asks a question
in plain English; the ADK agent uses the configured model to generate a
`SELECT`, runs it through a read-only database tool, and summarizes the returned
rows. Successful prompts and feedback are saved to `data/prompts.xlsx`.

## Requirements

- Node.js 24.13.0 or later and npm 11.8.0 or later
- PostgreSQL with the tables in `../schema.sql`
- Ollama running with the configured model available at its OpenAI-compatible
  API endpoint

## Configure and run

From the `Data Guide Assist` directory:

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create the local database config and edit its connection values:

   ```sh
   # PowerShell
   Copy-Item config/database.example.json config/database.json
   ```

   `config/database.json` is ignored by Git so its password stays local.
   Configure the database connection and SSL option in that file.

3. Edit `config/agent.json` to select the provider, model endpoint, API key,
   and model name. The default values target Ollama at
   `http://localhost:11434/v1` with the `gemma4:cloud` model; Ollama accepts
   `ollama` as the API key for this compatible endpoint.

4. Load the schema and (optionally) the sample records from the repository
   root. Use the host, database, and user appropriate for your installation:

   ```sh
   psql -h 127.0.0.1 -U postgres -d capstone -f ../schema.sql
   psql -h 127.0.0.1 -U postgres -d capstone -f ../sample_data.sql
   ```

5. Make sure Ollama is running and the configured model is available, then start
   the API and UI:

   ```sh
   ollama pull gemma4:cloud
   npm run dev
   ```

Open the Vite URL shown in the terminal. The prompt is sent to the Express API,
which invokes the ADK agent and PostgreSQL tool. The response, generated SQL,
and returned rows appear in the UI.

## Database permissions and limits

The API runs queries inside PostgreSQL `READ ONLY` transactions, accepts only
single `SELECT` statements, applies a statement timeout, and caps returned rows.
Use a dedicated database account that can only read the application tables;
the transaction guard is an additional safeguard, not a replacement for
database permissions. For example, run the following as a database
administrator, replacing the password and database name:

```sql
CREATE ROLE data_guide_readonly LOGIN PASSWORD 'replace-this-password';
GRANT CONNECT ON DATABASE capstone TO data_guide_readonly;
GRANT USAGE ON SCHEMA public TO data_guide_readonly;
GRANT SELECT ON TABLE
    product_categories, products, customers, orders, order_items, invoices
    TO data_guide_readonly;
ALTER ROLE data_guide_readonly SET default_transaction_read_only = on;
```

Set `config/database.json` to use this account. The agent's model and database
query limits are editable in `config/agent.json` (`model`, `maxRows`, and
`statementTimeoutMs`); Ollama settings (`provider`, `baseURL`, `apiKey`, and
`model`) are in the same file. The API key is kept in local config and should
not be a real provider secret committed to source control. The supported tables
and columns are listed in `server/agent.ts`; update those instructions if the
schema changes.

## Guardrails and offline evaluations

The API validates prompt length and control characters. SQL is limited to one
`SELECT` against the six application tables; comments, write statements,
unapproved database functions, wildcard columns, and comma-separated table
lists are rejected. Customer email, phone, and address fields cannot be
selected or used in filters. Queries still run in a read-only transaction with
a timeout and row cap. Use a least-privilege PostgreSQL account as an
additional safeguard; application checks do not replace database permissions.
For predictable enforcement, generated SQL must use direct table references
and explicit `JOIN`s; CTEs, derived tables in `FROM`, quoted identifiers, and
comma-separated `FROM` lists are intentionally unsupported.

The agent is instructed to treat user prompts and database values as untrusted,
ignore attempts to override its instructions, and ground factual answers in
query results. These instructions and output bounds are safeguards, not a
formal proof that every generated explanation is factually correct.

Run `npm test` for offline regression evaluations with representative English
questions and expected SQL examples, safe SQL acceptance, dangerous SQL
rejection, privacy rules, row-limit behavior, and prompt/answer bounds. These
deterministic tests do not call Ollama or verify that a live model generates
the expected SQL or a factually correct explanation.

## Tests and production build

```sh
npm test
npm run build
```

For a production build, run `npm run build`, then `npm start`. The Express
server serves the built UI from `dist`.
