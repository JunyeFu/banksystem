export class HarnessError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    public readonly category: string,
    message: string,
    public readonly retryable = false,
    public readonly userActionRequired = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HarnessError';
  }
}

export function asHarnessError(error: unknown): HarnessError {
  if (error instanceof HarnessError) return error;
  return new HarnessError(500, 'INTERNAL_ERROR', 'HARNESS', '请求处理失败。', false, false);
}
