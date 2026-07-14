let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function isAuthenticated(): boolean {
  return inMemoryAccessToken !== null;
}

export function clearAccessToken(): void {
  inMemoryAccessToken = null;
}
