-- Add OPERATOR and USER roles to UserRole enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'UserRole' AND e.enumlabel = 'OPERATOR') THEN
        ALTER TYPE "UserRole" ADD VALUE 'OPERATOR';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'UserRole' AND e.enumlabel = 'USER') THEN
        ALTER TYPE "UserRole" ADD VALUE 'USER';
    END IF;
END$$;
