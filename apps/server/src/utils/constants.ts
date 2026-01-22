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
 * All features are now enabled by default.
 */
export const USE_V4_WORKSPACE_SCOPING = true;
export const USE_V4_DUAL_WRITE = true;
export const USE_V4_READS = true;
export const USE_V4_SHADOW_READS = true;

// Keep object for backward compatibility
export const FEATURE_FLAGS = {
    USE_V4_WORKSPACE_SCOPING,
    USE_V4_DUAL_WRITE,
    USE_V4_READS,
    USE_V4_SHADOW_READS,
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
