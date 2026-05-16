export const shouldResetNeo4jConnection = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /connection|connectivity|connection acquisition|pool|socket|timeout|econnreset|service unavailable|routingtable|routing table|no routing servers|could not perform discovery/i.test(
    message,
  );
};
