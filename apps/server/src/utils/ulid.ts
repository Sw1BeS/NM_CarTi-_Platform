import { ulid } from 'ulid';

/**
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier)
 * Returns a 26-character string suitable for CHAR(26) database fields
 * 
 * @returns {string} ULID string (26 uppercase alphanumeric characters)
 * @example
 * const id = generateULID(); // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
export function generateULID(): string {
    return ulid();
}

/**
 * System Workspace ID constant
 * This workspace is used for system-wide defaults (entity types, dictionaries)
 * and is never deleted. All system entity types and dictionaries belong to this workspace.
 */
export const SYSTEM_WORKSPACE_ID = '01SYSTEM00000000000000000000';

/**
 * Validate if a string is a valid ULID format
 * @param id - String to validate
 * @returns {boolean} True if valid ULID format
 */
export function isValidULID(id: string): boolean {
    return /^[0-9A-Z]{26}$/.test(id);
}
