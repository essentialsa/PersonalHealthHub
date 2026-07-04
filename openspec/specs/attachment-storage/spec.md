# attachment-storage Specification

## Purpose
TBD - created by archiving change import-attachment. Update Purpose after archive.
## Requirements
### Requirement: Attachment storage in localStorage
The system SHALL store health report attachments as base64 data URLs in localStorage under the key `health_attachments_v1`.

#### Scenario: Store attachment successfully
- **WHEN** user uploads a valid file (image or PDF, ≤10MB)
- **THEN** system creates a HealthAttachment object with id, fileName, fileType, fileSize, data (base64), date, categoryId, createdAt
- **AND** stores it in localStorage under `health_attachments_v1`

#### Scenario: File exceeds size limit
- **WHEN** user uploads a file larger than 10MB
- **THEN** system displays an error message indicating the file size limit
- **AND** does not store the file

#### Scenario: Invalid file type
- **WHEN** user uploads a file that is not JPEG, PNG, GIF, WEBP, or PDF
- **THEN** system displays an error message indicating unsupported file type
- **AND** does not store the file

### Requirement: Attachment retrieval
The system SHALL retrieve attachments by id or by date/category criteria.

#### Scenario: Retrieve attachment by id
- **WHEN** system needs to display an attachment with a known id
- **THEN** system returns the full HealthAttachment object including base64 data

#### Scenario: Retrieve attachments by date range
- **WHEN** system needs to list attachments for a specific date or date range
- **THEN** system returns all matching HealthAttachment objects

#### Scenario: Retrieve attachments by category
- **WHEN** system needs to list attachments for a specific category
- **THEN** system returns all HealthAttachment objects with matching categoryId

### Requirement: Attachment deletion
The system SHALL allow deletion of attachments and cascade to associated records.

#### Scenario: Delete attachment
- **WHEN** user deletes an attachment
- **THEN** system removes the HealthAttachment from localStorage
- **AND** removes the attachmentId reference from all associated HealthRecord objects

### Requirement: Attachment size management
The system SHALL track total attachment storage usage and warn when approaching limits.

#### Scenario: Check storage usage
- **WHEN** system calculates total size of all stored attachments
- **THEN** system returns the total size in bytes

#### Scenario: Storage approaching limit
- **WHEN** total attachment size exceeds 20MB
- **THEN** system displays a warning recommending the user delete old attachments

