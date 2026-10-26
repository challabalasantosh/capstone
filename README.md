# Prompt2Insight

Prompt2Insight is a web application for asking questions about a PostgreSQL
database in plain English. Its React UI sends questions to an Express API, where
a Google Agent Development Kit (ADK) agent uses Ollama by default, or another
OpenAI-compatible provider configured by the user, to generate a `SELECT`
query, run it against PostgreSQL, and summarize the results. Successful prompts
and feedback are saved to PostgreSQL with the signed-in user's account.

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
CREATE DATABASE teamdb;
```

Exit `psql`. From the repository root, run `schema.sql` first to create the
application tables:

```sh
psql -h 127.0.0.1 -U postgres -d teamdb -f schema.sql
```

The schema creates these six tables:
`product_categories`, `products`, `customers`, `orders`, `order_items`, and
`invoices`.

In pgAdmin 4, open the `teamdb` database's Query Tool and run
[`auth_feedback.sql`](./auth_feedback.sql) after creating the application role
and running `schema.sql`. This creates the login and query-feedback tables,
adds the four demo accounts, and grants the application role the permissions
needed for sign-in and feedback.

The demo credentials are:

| User name | Password |
| --- | --- |
| `santosh` | `santosh` |
| `santoshi` | `santoshi` |
| `suresh` | `suresh` |
| `guru` | `guru` |

These passwords are intentionally simple for a local demo. Do not use them in
a deployed or publicly accessible application. The SQL script stores bcrypt
password hashes using PostgreSQL `pgcrypto`; the server validates credentials
through a database function and does not retrieve password hashes.

The tables created by the script are:

| Table | Columns |
| --- | --- |
| `app_users` | `username` (primary key), `display_name`, `password_hash`, `created_at` |
| `query_feedback` | `query_id` (UUID primary key), `user_id` (foreign key to `app_users.username`), `input_text`, `generated_query`, `workflow_data` (JSONB), `feedback`, `created_at`, `feedback_updated_at` |

Each successful interaction adds a `query_feedback` row for that user.
`generated_query` is `NULL` if the agent did not run SQL. `workflow_data`
stores the query result rows, business analysis, report summary, key points,
and chart data as JSONB. `feedback` starts as `NULL`; clicking either feedback
button updates that same row, and users can change their rating later.
`feedback_updated_at` records the latest update time.

To replace the existing business-table sample rows with a professional,
fictional dataset, run `sample_data.sql` after the schema:

```sh
psql -h 127.0.0.1 -U postgres -d teamdb -f sample_data.sql
```

The SQL script clears and repopulates the six business tables with 6
categories, 18 products, 12 fictional customers, 24 orders, 48 order items,
and 24 invoices. Invoice subtotals are calculated from order items, with tax
calculated consistently. Dates are relative to the time the script runs, so
recent orders and monthly analysis remain useful. Example email addresses use
`example.com`; contact details are fictional.

**Important:** this script replaces all existing rows in
`product_categories`, `products`, `customers`, `orders`, `order_items`, and
`invoices` and restarts their identity counters. It does not modify app users
or saved query/feedback history. Review the script and make a database backup
before running it against any database containing records you need to keep.

Grant the application role access to the database. Connect to
`teamdb` as the PostgreSQL administrator:

```sh
psql -h 127.0.0.1 -U postgres -d teamdb
```

Then run:

```sql
GRANT CONNECT ON DATABASE teamdb TO data_guide_readonly;
GRANT USAGE ON SCHEMA public TO data_guide_readonly;
GRANT SELECT ON TABLE
    product_categories, products, customers, orders, order_items, invoices
    TO data_guide_readonly;
```

The agent's generated SQL still runs in explicit PostgreSQL read-only
transactions. The application role additionally gets narrowly scoped
permissions on `query_feedback` to insert query history, read it for
suggestions, and update feedback. The `auth_feedback.sql` script resets the
role's `default_transaction_read_only` setting if you previously enabled it;
the API itself enforces read-only agent queries and the role cannot write to
the business tables.

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
the `data_guide_readonly` PostgreSQL role. The connection config should use database
`teamdb` and user `data_guide_readonly`; the example file provides the default
host (`127.0.0.1`), port (`5432`), database, and user. The local
`config/database.json` file is ignored by Git; do not commit a real password.

```json
{
  "host": "127.0.0.1",
  "port": 5432,
  "database": "teamdb",
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

## Sign-in and prompt suggestions

Sign in with one of the four demo accounts listed above. The app validates
credentials through the parameterized `authenticate_app_user` database
function and sets an HTTP-only session cookie. The server uses the signed-in
account for query logging and feedback ownership rather than trusting a user ID
sent by the browser. Sessions are held in server memory for up to eight hours
and are cleared when the server restarts. Prompt suggestions combine the
signed-in user's recent `query_feedback.input_text` history with sample
questions.

Each successful request adds a `query_feedback` row. The feedback controls
update the row selected by `query_id`, scoped to the signed-in user, so another
user cannot change that interaction's rating.

## Multi-agent analysis workflow

The prompt workflow uses Google ADK for three specialist agents and LangGraph
for orchestration, without A2A:

1. The **Data Query Agent** creates and executes one approved read-only query
   through the existing database tool and SQL guardrails.
2. The **Business Analysis Agent** interprets the structured query rows and
   answers the user's question using those rows as evidence.
3. The **Report Agent** creates a concise summary, key points, and an optional
   bar-chart specification. The server validates chart columns and derives
   plotted values directly from the result rows rather than trusting values
   produced by the agent.

LangGraph carries the workflow state between agents. The completed result is
persisted in `query_feedback.workflow_data` for later review. If you ran
`auth_feedback.sql` before adding this workflow, run it again in pgAdmin; it
adds the `workflow_data` column with an idempotent migration.

The result card's **How the agents worked** panel shows each agent's task,
whether it ran, its user-facing output, and the query execution details
(columns, row count, and truncation status). This is an operational trace of
agent outputs and handoffs, not private chain-of-thought or internal prompts.

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
