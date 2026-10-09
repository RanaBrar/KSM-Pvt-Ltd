/**
 * ============================================================================
 * 🌐 ONLINE CLOUD DATABASE CONFIGURATION (SUPABASE)
 * ============================================================================
 * 
 * To connect your free online cloud database:
 * 
 * 1. Go to https://supabase.com and create a free account.
 * 2. Click "New project", choose a name (e.g. "ksm-attendance"), a database password, and region.
 * 3. In your Supabase Project Dashboard:
 *    - Click the Settings gear ⚙️ icon -> "API" (or "Project Settings" -> "Data API").
 *    - Copy "Project URL" (e.g. https://xyzcompany.supabase.co).
 *    - Copy "anon public" API Key (e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6...).
 * 4. Paste them directly into the two variables below:
 *      export const SUPABASE_URL = 'https://xyzcompany.supabase.co';
 *      export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
 * 5. In your Supabase Dashboard, click "SQL Editor" on the left menu:
 *    - Click "New query", open the file `supabase_schema.sql` from this project,
 *      paste all contents into the SQL editor, and click "RUN".
 * 
 * That's it! The app will automatically connect directly to the online database.
 * Even if you clear app storage or uninstall/reinstall the app, your data will
 * NEVER be lost!
 */

export const SUPABASE_URL: string = 'https://rdlhguetyavrexoqyjar.supabase.co/rest/v1/';

export const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkbGhndWV0eWF2cmV4b3F5amFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MjkwNDQsImV4cCI6MjEwNDEwNTA0NH0.hIbKiGWzgDYn7A6z2-0SIr1VzZyitbOm0qEk3ra0-hI';
