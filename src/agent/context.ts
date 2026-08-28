const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "moonshot-v1-8k": 8192,
  "moonshot-v1-32k": 32768,
  "moonshot-v1-128k": 131072,
  "kimi-k2.6": 256000,
};

export function getModelContextLimit(): number {
  const modelName = process.env.MOONSHOT_MODEL_NAME || "";
  return MODEL_CONTEXT_LIMITS[modelName] || 128000;
}
