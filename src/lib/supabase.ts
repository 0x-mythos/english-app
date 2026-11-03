import "server-only";
import { createClient } from "@supabase/supabase-js";

// Серверний клієнт із secret key: обходить RLS, тому лише в route handlers / server code.
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
