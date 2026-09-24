## Purpose

Defines security requirements for cloud-sync OAuth authorization flows, ensuring the PKCE code challenge uses the S256 method instead of plain.

## ADDED Requirements

### Requirement: OAuth PKCE S256
The Google Drive OAuth authorization code flow SHALL use the S256 code challenge method (`code_challenge_method: "S256"`, with SHA-256 hashed verifier), and SHALL NOT use the plain method.

#### Scenario: Authorization request
- **WHEN** the app initiates the Google Drive OAuth authorization request
- **THEN** the request includes `code_challenge_method=S256` and a SHA-256 derived `code_challenge`

#### Scenario: Token exchange
- **WHEN** the app exchanges the authorization code for tokens
- **THEN** the original plain `code_verifier` is sent as required by the S256 flow and the exchange succeeds against Google's OAuth endpoints
