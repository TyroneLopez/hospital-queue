import { createClient } from '@supabase/supabase-js';

// --- UPDATED TICKET TYPE ---
export type Ticket = {
  id: number; 
  created_at: string;
  patient_name: string;
  status: string; // 'waiting' | 'serving' | 'completed' | 'cancelled' | 'in_progress'

  // ✅ These are the fields you added that were missing in the definition
  service_type: string;        
  room_number: number | null;

  // Optional fields
  service_start_time?: string | null;
  service_end_time?: string | null;
  triage_level?: number | null;
  concern?: string | null;
};

// --- UPDATED DATABASE TYPE ---
export interface Database {
  public: {
    Tables: {
      tickets: {
        Row: Ticket;
        Insert: {
          // Allow inserting these fields
          patient_name: string;
          status?: string;
          service_type?: string; 
          room_number?: number | null;
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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);