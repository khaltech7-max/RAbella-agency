-- =============================================================================
-- MIGRATION 004: PROPERTY IMAGES GALLERY & EXTENDED PROPERTY ATTRIBUTES
-- =============================================================================

-- 1. Extend properties table with property_code, description, status, cover_image_url
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS property_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT '';

-- 2. Property Images Gallery Table
-- Automatically detects the data type of public.properties.id (UUID in Supabase, TEXT in PGlite)
-- so the foreign key constraint property_images_property_id_fkey is always compatible and never fails.
DO $$
DECLARE
  v_id_type text;
BEGIN
  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'properties'
    AND column_name = 'id';

  IF v_id_type = 'uuid' THEN
    -- If table previously created with incompatible TEXT column, drop and recreate with UUID
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'property_images' AND column_name = 'property_id' AND data_type = 'text'
    ) THEN
      DROP TABLE public.property_images CASCADE;
    END IF;

    -- Standard Supabase schema with UUID foreign key
    CREATE TABLE IF NOT EXISTS public.property_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      storage_path TEXT DEFAULT '',
      is_cover BOOLEAN NOT NULL DEFAULT FALSE,
      display_order INTEGER NOT NULL DEFAULT 0,
      caption TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  ELSE
    -- Fallback schema when properties.id is TEXT
    CREATE TABLE IF NOT EXISTS public.property_images (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
      property_id TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      storage_path TEXT DEFAULT '',
      is_cover BOOLEAN NOT NULL DEFAULT FALSE,
      display_order INTEGER NOT NULL DEFAULT 0,
      caption TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;

  -- 3. Indexes for fast lookup
  CREATE INDEX IF NOT EXISTS idx_property_images_property_id ON public.property_images(property_id);
  CREATE INDEX IF NOT EXISTS idx_property_images_order ON public.property_images(property_id, display_order ASC);
  CREATE INDEX IF NOT EXISTS idx_property_images_is_cover ON public.property_images(property_id, is_cover);
END $$;
