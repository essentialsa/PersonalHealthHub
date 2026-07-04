# attachment-view Specification

## Purpose
TBD - created by archiving change import-attachment. Update Purpose after archive.
## Requirements
### Requirement: Attachment indicator in record view
The RecordTable and RecordChart components SHALL display an attachment icon for records that have associated attachments.

#### Scenario: Show attachment icon
- **WHEN** a HealthRecord has a non-null attachmentId
- **THEN** system displays a Paperclip icon in the record's action area

#### Scenario: No attachment icon
- **WHEN** a HealthRecord has no attachmentId
- **THEN** system does not display the attachment icon

### Requirement: Attachment preview
The system SHALL provide a modal dialog for previewing attachments.

#### Scenario: Preview image attachment
- **WHEN** user clicks the attachment icon on a record with an image attachment
- **THEN** system opens a modal displaying the image at full size (with scroll if larger than viewport)

#### Scenario: Preview PDF attachment
- **WHEN** user clicks the attachment icon on a record with a PDF attachment
- **THEN** system opens a modal displaying the PDF via iframe

#### Scenario: Close preview
- **WHEN** user clicks the close button or outside the modal
- **THEN** system closes the preview modal

### Requirement: Attachment download
The system SHALL allow users to download attachments to their local device.

#### Scenario: Download attachment
- **WHEN** user clicks the download button in the preview modal
- **THEN** system triggers a browser download of the original file with its original filename

#### Scenario: Download from record list
- **WHEN** user clicks a download action on a record with an attachment
- **THEN** system triggers a browser download of the associated attachment

### Requirement: Attachment management in record view
The system SHALL allow users to remove attachment associations from records.

#### Scenario: Remove attachment from record
- **WHEN** user selects "remove attachment" on a record
- **THEN** system removes the attachmentId from the HealthRecord
- **AND** the HealthAttachment remains in storage (may be referenced by other records)

#### Scenario: Delete orphaned attachment
- **WHEN** an attachment has no remaining associated records
- **THEN** system may offer to delete the orphaned attachment to free storage

