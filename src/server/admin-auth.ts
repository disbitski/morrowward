function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function isAuthorizedBriefGenerator(
  request: Request,
  environment?: {
    CRON_SECRET?: string;
    ADMIN_API_TOKEN?: string;
  },
): boolean {
  const resolvedEnvironment = environment ?? {
    CRON_SECRET: process.env.CRON_SECRET,
    ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
  };
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length).trim();
  if (!provided) return false;

  return [resolvedEnvironment.CRON_SECRET, resolvedEnvironment.ADMIN_API_TOKEN]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .some((expected) => constantTimeEqual(provided, expected));
}
