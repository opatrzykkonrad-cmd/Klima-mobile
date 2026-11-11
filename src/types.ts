export type SmsMode = 'SIM' | 'SMSAPI' | 'MOCK';
export type SmsStatus = 'SENT_SIM' | 'SENT_API' | 'ERROR' | 'MOCK';
export type SmsTrigger = 'AUTO' | 'MANUAL' | 'TEST' | 'RETRY';
export type ServiceState = 'ok' | 'soon' | 'late';
export type ClientFilter = 'all' | 'soon' | 'late';

export interface Client {
  id: number;
  first_name: string | null;
  company_name: string | null;
  phone: string;
  address: string | null;
  device_model: string | null;
  last_service_date: string;
  service_interval_months: number;
  next_service_date: string;
  reminder_sent: 0 | 1;
  reminder_sent_at: string | null;
  sms_enabled: 0 | 1;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientInput {
  first_name?: string | null;
  company_name?: string | null;
  phone?: string;
  address?: string | null;
  device_model?: string | null;
  last_service_date?: string;
  service_interval_months?: number;
  sms_enabled?: boolean;
  notes?: string | null;
}

export interface SmsLog {
  id: number;
  client_id: number | null;
  phone: string;
  message: string;
  status: SmsStatus;
  trigger_type: SmsTrigger;
  sent_at: string;
  error_details: string | null;
  client_name?: string | null;
}

export interface Settings {
  sms_template: string;
  days_before: number;
  send_hour: string;
  sms_mode: SmsMode;
  smsapi_token: string;
  smsapi_sender: string;
  sim_delay_sec: number;
  sim_subscription_id: number | null;
  auto_send: boolean;
  sms_normalize: boolean;
}

export interface SendResult {
  status: SmsStatus;
  logId: number;
  error?: string;
}

export type FieldErrors = Partial<Record<keyof ClientInput, string>>;
