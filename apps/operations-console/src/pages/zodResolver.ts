import type { Resolver, FieldErrors as RhfFieldErrors } from 'react-hook-form';
import type { z } from 'zod';

export function zodResolver<T extends z.ZodType>(
  schema: T,
): Resolver<z.infer<T>> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) {
      return {
        values: result.data,
        errors: {},
      };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!errors[path]) {
        errors[path] = {
          type: issue.code,
          message: issue.message,
        };
      }
    }
    return {
      values: {},
      errors: errors as unknown as RhfFieldErrors<z.infer<T>>,
    };
  };
}
