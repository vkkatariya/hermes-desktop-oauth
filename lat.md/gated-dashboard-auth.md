# Gated Dashboard Auth

The application detects whether a remote dashboard is gated behind OAuth by examining the `/api/status` endpoint for an `auth_required: true` flag.

When a gated dashboard is detected, the dashboard connection logic switches from the legacy token-based authentication to the OAuth flow, prompting the user for browser-based login if they lack active session cookies.

## Switching between Token and OAuth

The application maintains an `authMode` configuration ("token" or "oauth") to support both legacy API key deployments and newer OAuth-gated deployments without overwriting each other's credentials.

## Handling authentication requirement

If the dashboard status indicates `auth_required: true` and the client does not have valid OAuth cookies, the connection flow surfaces an error indicating that sign-in is required, prompting the UI to show the "Sign in with Nous" button.

## ConnectionConfig OAuth fields

The `ConnectionConfig` type carries optional `authMode` and `oauth` sub-object fields alongside the existing connection fields, ensuring backward compatibility with existing configs.

### Default authMode

When no `authMode` is present in the stored JSON, the value defaults to `"token"` and `oauth.cookiesReady` defaults to `false`.

### authMode persistence

Setting `authMode` to `"oauth"` via `setConnectionConfig` is persisted to disk and survives a round-trip through `getConnectionConfig`.

### Switching authMode preserves other fields

Switching `authMode` from `"oauth"` back to `"token"` does not erase sub-fields like `lastLoginEmail` or `lastLoginAt` stored in the `oauth` object.

### PublicConnectionConfig no partitionName

`getPublicConnectionConfig` strips the `partitionName` field from the `oauth` sub-object so the renderer never sees the Electron session partition identifier.

### Migration from no-authMode JSON

Config files written before `authMode` was introduced (no `authMode` key in JSON) are transparently migrated to `authMode: "token"` with `cookiesReady: false` on first read.
