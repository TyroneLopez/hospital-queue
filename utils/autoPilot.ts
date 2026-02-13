import { supabase, Ticket } from './supabase/supabaseClient';

// --- TYPES ---
export type Room = { 
    id: number; 
    name: string; 
    service: string; 
    capacity: number; 
    is_active: boolean; 
    position: number; 
};

// --- CONFIGURATION ---
const SERVICE_DURATIONS: Record<string, number> = {
    'Triage / Vitals': 20000, 
    'Admin / Permits': 30000, 
    'Consultation': 60000, 
    'Dental': 80000, 
    'default': 45000 
};

const VARIANCE = 0.3; 

// --- HELPER ---
const getTargetDuration = (ticketId: number, service: string) => {
    const baseDuration = SERVICE_DURATIONS[service] || SERVICE_DURATIONS['default'];
    const randomFactor = Math.sin(ticketId) * VARIANCE; 
    return baseDuration * (1 + randomFactor);
};

// ==========================================
//  1. AUTO COMPLETE (Discharge Patients)
// ==========================================
export const runAutoComplete = async (tickets: Ticket[]) => {
    const now = new Date().getTime();
    const servingTickets = tickets.filter(t => t.status === 'serving' || t.status === 'in_progress');

    for (const ticket of servingTickets) {
        if (!ticket.service_start_time) continue;

        const startTime = new Date(ticket.service_start_time).getTime();
        const elapsed = now - startTime;
        const targetDuration = getTargetDuration(ticket.id, ticket.service_type || 'default');

        if (elapsed >= targetDuration) {
            console.log(`⚡ Auto-Complete: Finishing Ticket #${ticket.id}`);
            await supabase
                .from('tickets')
                .update({ 
                    status: 'completed', 
                    service_end_time: new Date().toISOString() 
                } as any)
                .eq('id', ticket.id);
        }
    }
};

// ==========================================
//  2. AUTO CALL (Fill Empty Rooms)
// ==========================================
export const runAutoCall = async (
    tickets: Ticket[], 
    enabledRooms: Room[], // Only rooms with Robot ON passed here
    activeRooms: Record<number, boolean>
) => {
    const servingTickets = tickets.filter(t => t.status === 'serving' || t.status === 'in_progress');
    const waitingTickets = tickets.filter(t => t.status === 'waiting');

    // Shuffle to prevent prioritizing the first room always
    const shuffledRooms = [...enabledRooms].sort(() => 0.5 - Math.random());

    for (const room of shuffledRooms) {
        // Double check if manually closed
        if (activeRooms[room.id] === false) continue;

        const occupants = servingTickets.filter(t => t.room_number === room.id).length;

        if (occupants < room.capacity) {
            const nextPatient = waitingTickets.find(t => t.service_type === room.service);

            if (nextPatient) {
                console.log(`🤖 Auto-Call: Calling ${nextPatient.patient_name} to ${room.name}`);
                await supabase
                    .from('tickets')
                    .update({ 
                        status: 'serving', 
                        room_number: room.id, 
                        service_start_time: new Date().toISOString() 
                    } as any)
                    .eq('id', nextPatient.id);
                
                break; // One call per cycle to be safe
            }
        }
    }
};

// --- HELPER: Generator ---
export const generateRandomPatient = async (rooms: Room[]) => {
    const prefixes = ['Guest', 'Student', 'Faculty', 'Staff'];
    const randomName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} #${Math.floor(Math.random()*900)+100}`;
    const services = rooms.map(r => r.service);
    const randomService = services[Math.floor(Math.random() * services.length)];

    await supabase.from('tickets').insert([{ 
       patient_name: randomName, 
       status: 'waiting', 
       service_type: randomService 
    }] as any);
};