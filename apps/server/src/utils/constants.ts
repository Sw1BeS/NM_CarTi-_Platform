/**
 * System-wide constants for v4.1 multi-tenant architecture
 */

import { SYSTEM_WORKSPACE_ID } from './ulid.js';

export { SYSTEM_WORKSPACE_ID };

/**
 * Default entity type slugs available in the System Workspace
 * These can be used by all workspaces and serve as templates
 */
export const SYSTEM_ENTITY_TYPES = {
    CAR: 'car',
    LEAD: 'lead',
    CONTACT: 'contact',
} as const;

/**
 * Default dictionary set slugs in the System Workspace
 * Used for normalization and data validation
 */
export const SYSTEM_DICTIONARY_SETS = {
    MAKE: 'make',           // Car manufacturers
    MODEL: 'model',         // Car models
    CITY: 'city',           // Geographic locations
    BODY_TYPE: 'body_type', // Car body types (sedan, suv, etc.)
    FUEL_TYPE: 'fuel_type', // Fuel types (petrol, diesel, electric, etc.)
} as const;

/**
 * Feature flags for v4.1 rollout
 * Enable these progressively during zero-downtime migration
 */
export const FEATURE_FLAGS = {
    /** Enable workspace scoping middleware (PR-0) */
    USE_V4_WORKSPACE_SCOPING: true,

    /** Enable dual-write to both legacy and v4.1 tables (PR-2) */
    USE_V4_DUAL_WRITE: true,

    /** Switch reads from legacy to v4.1 tables (PR-4) */
    USE_V4_READS: true,

    /** Enable shadow reads for parity checking (PR-4) */
    USE_V4_SHADOW_READS: true,
} as const;

/**
 * Default role IDs for memberships
 */
export const DEFAULT_ROLES = {
    OWNER: 'owner',
    ADMIN: 'admin',
    MANAGER: 'manager',
    DEALER: 'dealer',
    VIEWER: 'viewer',
} as const;

/**
 * Record status values
 */
export const RECORD_STATUS = {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
    DELETED: 'deleted',
} as const;

/**
 * Message direction values
 */
export const MESSAGE_DIRECTION = {
    INCOMING: 'incoming',
    OUTGOING: 'outgoing',
} as const;
