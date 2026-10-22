# Capstone - Data Guide Assist

Data Guide Assist is a web application for asking questions about a PostgreSQL
database in plain English. Its React UI sends questions to an Express API, where
a Google Agent Development Kit (ADK) agent uses Ollama by default, or another
OpenAI-compatible provider configured by the user, to generate a `SELECT`
query, run it against PostgreSQL, and summarize the results. Successful prompts
and feedback are saved to `Data Guide Assist/data/prompts.xlsx`.

## Install the prerequisites

- **PostgreSQL:** [Download PostgreSQL for Windows](https://www.postgresql.org/download/windows/)
- **pgAdmin 4:** [Download pgAdmin 4](https://www.pgadmin.org/download/)
- **Python:** [Download Python for Windows](https://www.python.org/downloads/windows/)
- **Git:** [Download Git](https://git-scm.com/downloads)
- **VS Code:** Install Visual Studio Code from the Microsoft Store.
- **Node.js and npm:** [Download Node.js](https://nodejs.org/en/download). The app requires Node.js 24.13.0 or later and npm 11.8.0 or later.
- **Ollama:** [Download Ollama](https://ollama.com/download) to run the default language model locally. The app can also be configured to use another OpenAI-compatible provider.

## Create the PostgreSQL database and role

The following commands assume PostgreSQL is running locally and `postgres` is
an administrator account. From a terminal, connect to PostgreSQL's default
`postgres` database:

```sh
psql -h 127.0.0.1 -U postgres -d postgres
```

Create the application login and database. Replace the password placeholder
with a strong password. Save it securely; you will use the same value in the
application's local database config.

```sql
CREATE ROLE data_guide_readonly
    LOGIN PASSWORD '<REPLACE_WITH_A_STRONG_PASSWORD>';
CREATE DATABASE capstone;
```

Exit `psql`. From the repository root, run `schema.sql` first to create the
application tables:

```sh
psql -h 127.0.0.1 -U postgres -d capstone -f schema.sql
```

The schema creates these six tables:
`product_categories`, `products`, `customers`, `orders`, `order_items`, and
`invoices`.

To add the optional sample rows, run `sample_data.sql` after the schema:

```sh
psql -h 127.0.0.1 -U postgres -d capstone -f sample_data.sql
```

The sample data file contains `INSERT` queries that populate the tables with
example records. It uses PostgreSQL `generate_series` to create 100 sample
categories, products, customers, orders, order items, and invoices. Skip this
step if you do not need sample records.

Grant the application role read-only access to the database. Connect to
`capstone` as the PostgreSQL administrator:

```sh
psql -h 127.0.0.1 -U postgres -d capstone
```

Then run:

```sql
GRANT CONNECT ON DATABASE capstone TO data_guide_readonly;
GRANT USAGE ON SCHEMA public TO data_guide_readonly;
GRANT SELECT ON TABLE
    product_categories, products, customers, orders, order_items, invoices
    TO data_guide_readonly;
ALTER ROLE data_guide_readonly SET default_transaction_read_only = on;
```

## Configure and run the application

Open a terminal in the `Data Guide Assist` directory:

```powershell
cd "Data Guide Assist"
npm install
```

Create a local database configuration by copying the example file:

```powershell
Copy-Item config/database.example.json config/database.json
```

Set the password in `config/database.json` to the same value used when creating
the `data_guide_readonly` role. The connection config should use database
`capstone` and user `data_guide_readonly`; the example file already provides
the default host (`127.0.0.1`), port (`5432`), database, and user. The local
`config/database.json` file is ignored by Git; do not commit a real password.

```json
{
  "host": "127.0.0.1",
  "port": 5432,
  "database": "capstone",
  "user": "data_guide_readonly",
  "password": "<REPLACE_WITH_THE_ROLE_PASSWORD>",
  "ssl": false
}
```

### Use Ollama

The default `config/agent.json` uses Ollama at `http://localhost:11434/v1`
with the `gemma4:cloud` model and the placeholder API key `ollama`. Make sure
Ollama is running and the configured model is available:

```sh
ollama pull gemma4:cloud
```

### Use another OpenAI-compatible provider (optional)

The app's connector supports OpenAI-compatible chat completions with function
calling. To use a different provider, change `provider`, `baseURL`, `apiKey`,
and `model` in `config/agent.json` to values from that provider. Keep the
existing `maxRows` and `statementTimeoutMs` settings.

For example, to use Google Gemini, create an API key in
[Google AI Studio](https://aistudio.google.com/apikey) and configure:

```json
{
  "provider": "openai-compatible",
  "baseURL": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "apiKey": "<YOUR_GEMINI_API_KEY>",
  "model": "<SUPPORTED_GEMINI_MODEL>",
  "maxRows": 100,
  "statementTimeoutMs": 10000
}
```

Use a Gemini model supported by Google's
[OpenAI compatibility API](https://ai.google.dev/gemini-api/docs/openai), and
follow the same pattern for other compatible services using their documented
endpoint, API key, and model identifier. The app reads the API key from
`config/agent.json`; it does not use `GEMINI_API_KEY` as an environment
variable. Do not commit real API keys. Since `config/agent.json` is part of the
project files, make provider/key changes locally and restore the placeholder
before committing or sharing changes.

After configuring Ollama or another provider, open the Vite URL printed in the
terminal. The UI displays the response, generated SQL, and returned rows.

## Database permissions and query guardrails

The API runs queries inside PostgreSQL `READ ONLY` transactions, accepts only
a single `SELECT`, applies a statement timeout, and caps returned rows. SQL is
limited to the six application tables. Comments, write statements, unapproved
database functions, wildcard columns, and comma-separated table lists are
rejected. Customer email, phone, and address fields cannot be selected or used
in filters.

For predictable enforcement, generated SQL must use direct table references
and explicit `JOIN`s. CTEs, derived tables in `FROM`, quoted identifiers, and
comma-separated `FROM` lists are intentionally unsupported. Application
checks are safeguards, not a replacement for least-privilege database
permissions.

The agent is instructed to treat user prompts and database values as untrusted,
ignore attempts to override its instructions, and ground factual answers in
query results. These controls and output bounds do not guarantee that every
generated explanation is factually correct.

The supported tables and columns are listed in
`Data Guide Assist/server/agent.ts`. Update those instructions if the schema
changes.

## Tests and production build

From the `Data Guide Assist` directory, run the offline regression tests:

```sh
npm test
```

The tests cover representative questions and expected SQL, safe SQL
acceptance, dangerous SQL rejection, privacy rules, row limits, and prompt
and answer bounds. They do not call a live model provider or validate live
model output.

Build the production UI and type-check the application:

```sh
npm run build
```

To start the production server after building:

```sh
npm start
```

The Express server serves the built UI from `dist`.
