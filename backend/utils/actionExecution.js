// The atomic claim is supplied by the repository. Never re-execute an uncertain write.
export async function executeApprovedAction({ claim, execute, save }) {
  const action = await claim();
  if (!action) return null;
  let result;
  try {
    result = { ok: true, data: await execute(action) };
  } catch (error) {
    result = { ok: false, error: { code: error.code || 'ACTION_UNCERTAIN', message: error.message, retryable: false } };
    await save(action, error.beforeExecution ? 'failed' : 'unknown', result);
    return result;
  }
  // If saving the receipt fails, leave the action executing. A retry must not invoke it again.
  await save(action, 'succeeded', result);
  return result;
}
