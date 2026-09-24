## MODIFIED Requirements

### Requirement: Attachment storage in localStorage
The system SHALL store health report attachments as base64 data URLs in localStorage under the key `health_attachments_v1`, scoped per user: the base key SHALL be used for unauthenticated local use, and the key with `__userId` suffix SHALL be used when a user is signed in, consistent with the user scoping of health record storage.

#### Scenario: Store attachment successfully
- **WHEN** user uploads a valid file (image or PDF, ≤10MB)
- **THEN** system creates a HealthAttachment object with id, fileName, fileType, fileSize, data (base64), date, categoryId, createdAt
- **AND** stores it in localStorage under the user-scoped attachments key

#### Scenario: File exceeds size limit
- **WHEN** user uploads a file larger than 10MB
- **THEN** system displays an error message indicating the file size limit
- **AND** does not store the file

#### Scenario: Invalid file type
- **WHEN** user uploads a file that is not JPEG, PNG, GIF, WEBP, or PDF
- **THEN** system displays an error message indicating unsupported file type
- **AND** does not store the file

## ADDED Requirements

### Requirement: Orphan attachment cleanup scope
The system SHALL perform orphan attachment cleanup against health records stored under the same user-scoped records key as the attachments being cleaned, so that cleanup only affects the current user's data.

#### Scenario: Cleanup with signed-in user
- **WHEN** a signed-in user triggers orphan attachment cleanup
- **THEN** the system reads health records from the user-scoped records key (`health_records_v1__userId`)
- **AND** only removes attachments not referenced by any record in that same scope

#### Scenario: Cleanup with no signed-in user
- **WHEN** no user is signed in and orphan cleanup runs
- **THEN** the system reads health records from the base records key (`health_records_v1`)
- **AND** leaves user-scoped attachments untouched
