-- Migration: drop the leftover demo flag. Real auth only; there is no demo mode.
delete from app_config where key = 'demo_mode';
