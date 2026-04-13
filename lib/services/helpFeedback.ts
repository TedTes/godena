import { supabase } from '../supabase';
export { getSessionUserId } from '../supabase';

export type FeedbackCategory = 'bug' | 'feedback' | 'account' | 'billing' | 'other';

export type FeedbackRow = {
  id: string;
  category: FeedbackCategory;
  subject: string;
  message: string;
  status: 'open' | 'reviewing' | 'resolved' | 'closed';
  created_at: string;
};

export async function submitFeedback(params: {
  userId: string;
  category: FeedbackCategory;
  subject: string;
  message: string;
}) {
  return supabase
    .from('help_feedback')
    .insert({
      user_id: params.userId,
      category: params.category,
      subject: params.subject,
      message: params.message,
    })
    .select('id, category, subject, message, status, created_at')
    .single();
}

export async function fetchMyFeedback(userId: string) {
  return supabase
    .from('help_feedback')
    .select('id, category, subject, message, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
}
