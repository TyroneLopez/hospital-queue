# Aldersgate College - Medical Services Queue System

A real-time patient queuing system designed for Aldersgate College Medical Services. This application manages patient flow through various clinics (OBGYNE, Dental, X-Ray, etc.) using a dual-interface approach: a **TV Dashboard** for patients and a **Control Console** for staff.

## 🚀 Key Features

### 🏥 Patient Dashboard (TV Display)
- **Real-time Updates:** The screen updates instantly when staff calls a patient (powered by Supabase Realtime).
- **Smart Estimation:** Wait times are calculated based on the specific service (e.g., Dental queue doesn't affect OBGYNE wait time).
- **Visuals:** 3x2 Grid layout showing 6 clinics per page with auto-pagination.
- **Audio Alerts:** Plays a chime sound when a patient is called.
- **Sorting & Filtering:** Patients can filter the list by Department/Service or sort by Name/Ticket Number.

### 👨‍⚕️ Staff Console & Triage
- **Triage System:** Staff can manually register walk-in patients and assign them to specific departments.
- **Strict Designation:** The system prevents calling a patient to the wrong room (e.g., Room 1 [OBGYNE] can only call OBGYNE patients).
- **Queue Management:**
  - **Call:** Assigns patient to room.
  - **Finish:** Marks transaction as complete.
  - **No Show:** Removes patient from queue.
  - **Return to Queue:** Places patient back in line but keeps their original priority (timestamp).
- **Room Controls:** Filter the view to see specific rooms or the global queue.

## 🛠️ Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS
- **Realtime:** Supabase Channels

---

## 📦 Getting Started

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_USERNAME/aldersgate-queue.git](https://github.com/YOUR_USERNAME/aldersgate-queue.git)
cd aldersgate-queue