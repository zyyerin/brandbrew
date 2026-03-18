/**
 * Browser Supabase client for Auth. Used for anonymous session and Edge Function Bearer token.
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseProjectRef, supabaseAnonKey } from "../config/public-env";

const supabaseUrl = `https://${supabaseProjectRef}.supabase.co`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
