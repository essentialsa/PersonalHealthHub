## Purpose

Defines import-time data integrity requirements for parsed health report results: detection of duplicate records and re-matching of renamed unmatched indicators so user corrections take effect.

## ADDED Requirements

### Requirement: Duplicate detection on import
When importing records from a parsed report (or Excel file), the system SHALL detect candidate duplicates against existing records by matching date, indicator type, and value, and SHALL warn the user before creating duplicates.

#### Scenario: Same report imported twice
- **WHEN** user imports records from a report whose date, indicator types, and values are identical to already-existing records
- **THEN** the system warns the user that duplicates were detected
- **AND** the user can choose to skip the duplicates or confirm importing them

#### Scenario: Partial duplicates
- **WHEN** some imported records match existing records and others do not
- **THEN** only the matching subset is flagged as duplicates
- **AND** non-matching records import without warning

### Requirement: Renamed indicator re-matching
When the user renames an unmatched (unnamed) indicator in the report import preview, the system SHALL re-run indicator matching for that entry, so that a name matching the user's indicator library or the standard dictionary becomes importable.

#### Scenario: Rename matches user indicator library
- **WHEN** user renames an unnamed indicator to a label that matches an existing user indicator item (exact or above the fuzzy threshold)
- **THEN** the entry is re-classified as importable and will be imported on confirmation

#### Scenario: Rename still unmatched
- **WHEN** user renames an unnamed indicator to a label that matches neither the user library nor the standard dictionary
- **THEN** the entry remains non-importable and the create-item suggestion (if any) reflects the new label
