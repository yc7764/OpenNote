import { apiClient } from '@/lib/apiClient';
import type { User } from '@/types/auth';

export type EmailChangeStatus = { pending: boolean; new_email?: string; expires_in?: number };

export async function fetchProfile(): Promise<User> { return apiClient('/api/auth/profile/'); }

export async function updateProfile(payload: Partial<User>): Promise<User> {
  return apiClient('/api/auth/profile/', { method: 'PUT', body: JSON.stringify(payload) });
}

export async function changePassword(payload: { current_password: string; new_password: string; confirm_password: string }): Promise<{ detail: string }> {
  return apiClient('/api/auth/change-password/', { method: 'POST', body: JSON.stringify(payload) });
}

export async function deleteAccount(payload: { password: string }): Promise<{ detail: string }> {
  return apiClient('/api/auth/delete-account/', { method: 'POST', body: JSON.stringify(payload) });
}

export async function emailChangeRequest(payload: { new_email: string; current_password: string }): Promise<{ detail: string }> {
  return apiClient('/api/auth/email/change/request/', { method: 'POST', body: JSON.stringify(payload) });
}

export async function emailChangeStatus(): Promise<EmailChangeStatus> { return apiClient('/api/auth/email/change/status/'); }


