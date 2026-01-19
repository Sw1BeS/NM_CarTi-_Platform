-- Add SUPER_ADMIN role to UserRole enum

-- This is an addendum to the Stage C migration
-- Run this AFTER the main Stage C migration

-- Update the UserRole enum to include SUPER_ADMIN
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'OWNER';

-- SUPER_ADMIN users don't require companyId
-- Making companyId nullable for SUPER_ADMIN compatibility (already done in main migration)

-- Create a SUPER_ADMIN user (update credentials as needed)
-- NOTE: You should hash the password properly in production
INSERT INTO "User" ("id", "email", "password", "name", "role", "companyId", "isActive", "createdAt", "updatedAt")
VALUES (
    'user_superadmin',
    'admin@cartie.system',
    'CHANGE_THIS_PASSWORD',  -- TODO: Hash this password
    'System Administrator',
    'SUPER_ADMIN',
    'company_system',  -- Associated with system company but can access all
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO NOTHING;

COMMENT ON COLUMN "User"."role" IS 'User role: SUPER_ADMIN (system), OWNER (company), ADMIN, MANAGER, VIEWER';
