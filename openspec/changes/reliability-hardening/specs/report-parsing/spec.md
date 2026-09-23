## Purpose

Defines reliability requirements for the vision-based medical report parsing pipeline: explicit failure on empty results, sufficient model output capacity, serverless time-budget compliance, client request cancellation, and multi-endpoint fallback behavior.

## ADDED Requirements

### Requirement: Explicit failure on empty parse results
The parsing service SHALL return a failure response with a human-readable error when the vision model completes without recognizing any indicator across all submitted pages, instead of returning success with an empty indicator list.

#### Scenario: All pages yield no indicators
- **WHEN** the vision model processes every page of a report and the accumulated, normalized indicator list is empty
- **THEN** the API responds with `success=false` and an error message instructing the user to check image clarity or retry
- **AND** the client displays this error to the user

#### Scenario: Partial page success
- **WHEN** some pages yield indicators and other pages yield none
- **THEN** the API responds with `success=true` containing the indicators from successful pages
- **AND** the service logs a warning for each page that yielded no indicators

### Requirement: Model output capacity
The default parsing model configuration SHALL provide a maximum output token budget of at least 8192 tokens, so that a single page containing 40+ indicators can be returned without truncation; the budget SHALL be configurable via environment variable. The primary and fallback models MAY belong to different providers, each with independently configurable endpoint URL and API credentials, and the fallback model SHALL be attempted when the primary fails.

#### Scenario: Single page with many indicators
- **WHEN** a page contains 40 or more indicator rows
- **THEN** the model's output token limit is large enough to return the complete JSON indicator list without truncation

#### Scenario: Primary model unavailable
- **WHEN** the primary model request fails (rate limit, timeout, or server error)
- **THEN** the service retries with the configured fallback model before surfacing an error

#### Scenario: Cross-provider fallback
- **WHEN** the primary provider fails and the fallback model belongs to a different provider with its own endpoint and credentials
- **THEN** the fallback request is sent to the fallback provider's endpoint using the fallback credentials

### Requirement: Serverless time budget
The end-to-end server-side parse duration for a multi-page report SHALL remain within the deployment platform's function timeout, using page batching and/or per-request time budgets; the client-side request timeout SHALL NOT exceed the server-side hard limit by more than a small margin.

#### Scenario: Multi-page report within budget
- **WHEN** user submits a report with the maximum supported number of pages
- **THEN** server-side processing completes within the platform function timeout (60s on the current deployment)
- **AND** no request is killed mid-parse by the platform

#### Scenario: Client timeout alignment
- **WHEN** the client sets a timeout for the parse request
- **THEN** the timeout is aligned with the server-side limit so users receive the server's structured error rather than waiting past a guaranteed-failure window
- **AND** timeout messages do not reference retired deployment platforms

### Requirement: Client request cancellation
The report import dialog SHALL abort in-flight parse and label-matching requests when the dialog is closed, so that no orphaned requests continue consuming quota or update state after dismissal.

#### Scenario: Dialog closed during parsing
- **WHEN** user closes the report import dialog while a parse request is in flight
- **THEN** the request is aborted and no result/error toast appears after dismissal

#### Scenario: Dialog closed during label matching
- **WHEN** user closes the dialog while secondary label matching is in flight
- **THEN** the matching request is aborted and its pending suggestion state is discarded

### Requirement: Endpoint fallback chain
When multiple parser endpoints are configured, the client SHALL attempt the next endpoint on any failed attempt (network error, timeout, 5xx, and non-parameter 4xx responses), and only parameter-validation errors (422-class) SHALL short-circuit the chain; when all endpoints fail, the aggregated error SHALL be reported.

#### Scenario: Cloud endpoint returns 4xx
- **WHEN** the primary endpoint responds with a non-422 4xx status (e.g. 400, 401, 429)
- **THEN** the client continues to the next configured endpoint instead of terminating the chain

#### Scenario: All endpoints fail
- **WHEN** every configured endpoint fails
- **THEN** the client surfaces an aggregated error summarizing each attempt
