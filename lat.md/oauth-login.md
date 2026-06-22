# OAuth Login

The dashboard OAuth login flow uses an Electron BrowserWindow configured with a persistent partition (`persist:hermes-oauth-<profile>`) to isolate cookies from the rest of the application and preserve them across restarts.

The flow navigates to the `/auth/login` endpoint of the dashboard, which initiates the OAuth round-trip. Upon successful authentication, the server redirects back to `/auth/callback` and sets `hermes_session_at` and `hermes_session_rt` as HttpOnly cookies.

## Persistent OAuth partition

A dedicated persistent partition ensures that the session cookies are safely stored and do not leak into other contexts.

## Session cookie detection

We can determine if an active session exists by querying the session partition for the `hermes_session_at` and `hermes_session_rt` cookies.

## Browser login flow

The login flow opens a `BrowserWindow` and monitors navigation events. When it detects a redirect to `/auth/callback`, it checks for the presence of session cookies to resolve the login successfully.

## Logout and session clearing

Logging out involves clearing all cookies from the persistent partition associated with the dashboard URL.
