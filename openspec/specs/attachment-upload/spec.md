# attachment-upload Specification

## Purpose
TBD - created by archiving change import-attachment. Update Purpose after archive.
## Requirements
### Requirement: Attachment upload in Excel import
The ImportRecordsDialog SHALL provide an optional file upload zone for attaching a report file.

#### Scenario: Upload attachment during Excel import
- **WHEN** user opens ImportRecordsDialog and selects a file in the attachment upload zone
- **THEN** system validates the file type and size
- **AND** displays a preview of the selected file
- **AND** associates the attachment with the imported records upon confirmation

#### Scenario: Skip attachment upload
- **WHEN** user does not select a file in the attachment upload zone
- **THEN** system proceeds with import without creating an attachment

#### Scenario: Change selected attachment
- **WHEN** user has selected a file and selects a different file
- **THEN** system replaces the previously selected file with the new one

### Requirement: Attachment upload in OCR report import
The MedicalReportImportDialog SHALL provide an option to retain the uploaded report as an attachment.

#### Scenario: Retain report as attachment
- **WHEN** user uploads a PDF/image for OCR processing and opts to retain it
- **THEN** system creates a HealthAttachment from the uploaded file
- **AND** associates it with the imported records

#### Scenario: Discard report after OCR
- **WHEN** user opts not to retain the uploaded report
- **THEN** system processes the OCR but does not store the original file

### Requirement: Attachment association with records
The system SHALL associate uploaded attachments with the HealthRecord objects created during import.

#### Scenario: Single attachment to multiple records
- **WHEN** user imports multiple indicators from one report with an attachment
- **THEN** all imported HealthRecord objects reference the same HealthAttachment id

#### Scenario: Attachment metadata
- **WHEN** system creates a HealthAttachment during import
- **THEN** the attachment's date SHALL match the import date
- **AND** the attachment's categoryId SHALL match the selected import category (if applicable)

