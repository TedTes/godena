import { supabase } from '../supabase';
export { getSessionUserId } from '../supabase';

export type NotificationPrefs = {
  notify_group_messages: boolean;
  notify_connection_messages: boolean;
  notify_reveals: boolean;
  notify_events: boolean;
  notify_marketing: boolean;
};

export async function fetchNotificationPrefs(userId: string) {
  return supabase
    .from('profiles')
    .select('notify_group_messages, notify_connection_messages, notify_reveals, notify_events, notify_marketing')
    .eq('user_id', userId)
    .maybeSingle();
}

export async function updateNotificationPrefs(userId: string, patch: Partial<NotificationPrefs>) {
  return supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('notify_group_messages, notify_connection_messages, notify_reveals, notify_events, notify_marketing')
    .single();
}
