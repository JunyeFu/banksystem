let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function isAuthenticated(): boolean {
  return inMemoryAccessToken !== null || import.meta.env.VITE_E2E_AUTH_BYPASS === 'true';
}

export function clearAccessToken(): void {
  inMemoryAccessToken = null;
}
