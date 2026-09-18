import { isSafeDomain } from "./is-safe-domains";

export function checkNetworkPermission(toolCall: {
  name: string;
  args: Record<string, any>;
}): { action: "allow" } | { action: "confirm" } {
  const url = toolCall.args?.url;
  if (typeof url !== "string") {
    return { action: "allow" };
  }

  if (isSafeDomain(url)) {
    return { action: "allow" };
  }

  return { action: "confirm" };
}
