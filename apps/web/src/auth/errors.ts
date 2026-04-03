import type { ApiError } from '@/lib/api';

export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'code' in error && 'status' in error;
}
