import { api } from "../client";
import type { McpConnectionResponse } from "../types/mcp";

/** Public address of the read-only Claude connector, to paste in Claude under
 * Settings > Connectors > Add custom connector. */
export const CLAUDE_CONNECTOR_URL = "https://api.mfspace.lu/mcp";

/** "Claude connections": who connected Claude to this business, and revoking a
 * connection. A manager sees every connection; anyone else only their own. */
export const mcpConnectionsApi = {
  list: (companyId: string) => api.get<McpConnectionResponse[]>(`/api/companies/${companyId}/mcp-connections`),
  revoke: (companyId: string, id: string) =>
    api.post<void>(`/api/companies/${companyId}/mcp-connections/${id}/revoke`, {}),
};
