import { createClient } from '@supabase/supabase-js';

// TypeScript interface for the `tickets` table
export type Ticket = {
  id: number | string; // id may be integer or uuid depending on DB
  patient_name?: string | null;
  concern?: string | null;
  status: 'waiting' | 'in_progress' | 'serving' | 'completed' | 'cancelled' | string;
  triage_level?: number | null; // numeric priority (e.g., 1 = highest)
  created_at?: string | null; // ISO timestamp
  service_start_time?: string | null;
  service_end_time?: string | null;
};

// Minimal Database type for use with supabase-js generics
export interface Database {
  public: {
    Tables: {
      tickets: {
        Row: Ticket;
        Insert: {
          id?: string;
          patient_name: string;
          status?: Ticket['status'];
          triage_level?: number;
          created_at?: string;
        };
        Update: Partial<Ticket>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. See .env.example');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  // Add any global options here if needed
});
