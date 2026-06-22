# WS Ticket Minting

To establish a WebSocket connection to an OAuth-gated dashboard, the client must first exchange its session cookies for a short-lived, single-use ticket via a REST request to `POST /api/auth/ws-ticket`.

This ticket is then appended as a query parameter `?ticket=<ticket>` to the WebSocket URL, allowing the server to authenticate the upgrade request without needing to process cookies during the WebSocket handshake.

## REST request with session cookies

The `net` module in Electron is used to make HTTP requests bound to the specific OAuth partition, ensuring that session cookies are automatically included in the request headers.

## Ticket minting

A `POST` request to `/api/auth/ws-ticket` using the OAuth session returns a JSON payload containing the single-use ticket string.

## Fresh WS URL

The ticket is appended to the WebSocket URL (`/api/ws?ticket=...`), ensuring that every new connection attempt uses a freshly minted ticket to satisfy authentication.
