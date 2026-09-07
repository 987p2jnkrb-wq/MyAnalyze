export interface AppActivityLog extends Record<string, unknown> {
  id: number;
  action_type: string;
  entity_type: string;
  timestamp: string;
  user_id?: number;
  entity_id?: number;
  old_data?: unknown;
  new_data?: unknown;
  ip_address?: string;
  device_info?: string;
  metadata?: unknown;
  [key: string]: unknown;
}

export interface AppActivityLogContextType {
  logs: AppActivityLog[];
  loading: boolean;
  error: string | null;
  fetchLogs: () => Promise<void>;
}
