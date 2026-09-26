# EchoGPT Postman assets

Generated from the live OpenAPI document at `GET /api/docs-json`.

## Files

| File | Purpose |
| --- | --- |
| `EchoGPT.Backend.API.postman_collection.json` | Full collection (63 Swagger ops + 1 admin-login convenience alias) |
| `EchoGPT.Local.postman_environment.json` | Local environment variables |
| `openapi.json` | Snapshot of the OpenAPI source used for generation |

## Import into Postman

1. Postman → **Import** → select both JSON files above, **or**
2. Provide a Postman API key (`PMAK-...`) so the agent can create the collection in workspace `ba7c3a62-a39f-442a-8392-ffbd1b44064a` via the Postman REST API.

> Note: The connected Postman MCP integration in this project is **read-only** (list/search/get only). Creating collections requires either Import or the Postman Collections API with an API key.

## Suggested first requests

1. `Auth / Log in as seeded admin` (or `Log in with email and password`)
2. `Admin / Dashboard & System / Admin dashboard statistics`
3. `Chat / Create a conversation` → then `Send a chat message...`
