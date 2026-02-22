// Types matching backend schemas

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  default_workspace_id: string | null;
}

export interface Token {
  access_token: string;
  refresh_token: string;
}

export interface CallResponse {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  created_at: string;
  from_number: string | null;
  to_number: string | null;
  contact_name: string | null;
  contact_id: number | null;
  agent_id: string | null;
  agent_name: string | null;
  is_ai: boolean;
  booking_outcome: string | null;
}

export interface PaginatedCalls {
  items: CallResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  completed_count: number;
  total_duration_seconds: number;
}

export interface ConversationSummary {
  id: string;
  contact_phone: string;
  workspace_phone: string;
  channel: string;
  status: string;
  ai_enabled: boolean;
  contact_id: number | null;
  contact_name: string | null;
  assigned_agent_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
}

export interface PaginatedConversations {
  items: ConversationSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  body: string | null;
  status: string;
  is_ai: boolean;
  agent_id: string | null;
  created_at: string;
}

export interface ConversationWithMessages {
  id: string;
  contact_phone: string;
  workspace_phone: string;
  channel: string;
  status: string;
  ai_enabled: boolean;
  contact_id: number | null;
  contact_name: string | null;
  messages: Message[];
}

export interface Contact {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string;
  company: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface PaginatedContacts {
  items: Contact[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  channel_mode: string;
  voice_provider: string;
  voice_id: string;
  language: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  initial_greeting: string | null;
  is_active: boolean;
  total_calls: number;
  total_messages: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_contacts: number;
  active_campaigns: number;
  calls_today: number;
  messages_sent: number;
  contacts_change: string;
  campaigns_change: string;
  calls_change: string;
  messages_change: string;
}

export interface RecentActivity {
  id: string;
  type: string;
  contact: string;
  initials: string;
  action: string;
  time: string;
  duration: string | null;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recent_activity: RecentActivity[];
  campaign_stats: any[];
  agent_stats: any[];
  today_overview: {
    completed: number;
    pending: number;
    failed: number;
  };
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

export interface AISearchResult {
  answer: string;
  sources: {
    type: string;
    id: string;
    title: string;
    snippet: string;
    date: string;
  }[];
}
