import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, key!) : null;

export type AssistantSettings = {
  assistantName: string;
  preferredVoice: string;
  speechRate: number;
  speechPitch: number;
  personalityIntensity: number;
  humourLevel: number;
  personalityMode: 'calm' | 'witty' | 'precise';
  wakePhrase: string;
};

export const defaultSettings: AssistantSettings = {
  assistantName: 'ULTRON',
  preferredVoice: '',
  speechRate: 1,
  speechPitch: 1,
  personalityIntensity: 65,
  humourLevel: 24,
  personalityMode: 'calm',
  wakePhrase: 'Hey ULTRON',
};

export async function loadSettings(userId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveSettings(userId: string, settings: AssistantSettings) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    assistant_name: settings.assistantName,
    preferred_voice: settings.preferredVoice,
    speech_rate: settings.speechRate,
    speech_pitch: settings.speechPitch,
    personality_intensity: settings.personalityIntensity,
    humour_level: settings.humourLevel,
    personality_mode: settings.personalityMode,
    wake_phrase: settings.wakePhrase,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}
