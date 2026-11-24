/** One Claude connector connection to the current business (GET /mcp-connections). */
export interface McpConnectionResponse {
  id: string;
  clientName: string;
  userId: string;
  userName: string;
  /** The connection belongs to the signed-in person. */
  isMine: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  /** When the connection ends unless Claude uses it again (refresh tokens rotate on use). */
  expiresAt: string;
}
