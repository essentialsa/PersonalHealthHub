## MODIFIED Requirements

### Requirement: Attachment upload in OCR report import
The MedicalReportImportDialog SHALL provide an option to retain the uploaded report as an attachment, and SHALL surface attachment save failures to the user instead of silently proceeding.

#### Scenario: Retain report as attachment
- **WHEN** user uploads a PDF/image for OCR processing and opts to retain it
- **THEN** system creates a HealthAttachment from the uploaded file
- **AND** associates it with the imported records

#### Scenario: Discard report after OCR
- **WHEN** user opts not to retain the uploaded report
- **THEN** system processes the OCR but does not store the original file

#### Scenario: Attachment save fails during report import
- **WHEN** user opts to retain the report as an attachment but the save fails (e.g. file exceeds the attachment size limit, storage quota exceeded)
- **THEN** system displays an explicit error message stating the attachment was not saved
- **AND** imported records SHALL NOT reference a non-existent attachment id

#### Scenario: Size limit consistency
- **WHEN** the report import dialog accepts a file for parsing
- **THEN** the file size limit advertised or enforced by the dialog SHALL NOT exceed the attachment service's storable limit
- **AND** files accepted for parsing-with-retention that exceed the attachment limit SHALL be rejected or warned before import, not silently dropped
