export interface RuntimeConfig {
  configured: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
}

export interface Profile {
  id: string;
  display_name: string;
  email?: string;
  role: string;
  roles?: string[];
  status: string;
  discipline_points?: number;
  joined_at?: string;
  updated_at?: string;
  avatar_initials?: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
  theme_preference?: string;
  member_code?: string | null;
  is_system_account?: boolean;
  suspended_until?: string | null;
  committee_id?: string | null;
  committees?: { id?: string; name: string } | null;
  profile_committees?: Array<{
    committee_id: string;
    role_in_committee?: string | null;
    committee?: { id: string; name: string; status?: string } | null;
    committees?: { id: string; name: string; status?: string } | null;
  }>;
}

export interface NamedProfile {
  display_name?: string;
}

export interface PortalState {
  booting: boolean;
  loading: boolean;
  config: RuntimeConfig | null;
  profile: Profile | null;
  sidebarOpen: boolean;
  cache: Record<string, any>;
  filters: Record<string, string>;
  pendingConfirm: null | (() => Promise<void> | void);
  celebratedRewards?: Set<string>;
  pageError?: { page: string; message: string } | null;
  modalReturnFocus?: HTMLElement | null;
}
