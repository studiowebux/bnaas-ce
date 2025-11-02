// WebSocket manager for real-time updates
export class WebSocketManager {
  private connections: Set<WebSocket> = new Set();

  addConnection(websocket: WebSocket): void {
    this.connections.add(websocket);
    console.log(
      `WebSocket connection added. Total connections: ${this.connections.size}`,
    );

    websocket.addEventListener("close", () => {
      this.connections.delete(websocket);
      console.log(
        `WebSocket connection removed. Total connections: ${this.connections.size}`,
      );
    });

    websocket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      this.connections.delete(websocket);
    });
  }

  broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    const deadConnections: WebSocket[] = [];

    for (const ws of this.connections) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        } else {
          deadConnections.push(ws);
        }
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
        deadConnections.push(ws);
      }
    }

    // Clean up dead connections
    deadConnections.forEach((ws) => this.connections.delete(ws));
  }

  // Specific broadcast methods
  broadcastTaskUpdate(taskId: string, task: any): void {
    this.broadcast({
      type: "task_update",
      taskId,
      task,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastAgentUpdate(agentId: string, agent: any): void {
    this.broadcast({
      type: "agent_update",
      agentId,
      agent,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLogUpdate(taskId: string, log: string): void {
    this.broadcast({
      type: "log_update",
      taskId,
      log,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastStatisticsUpdate(statistics: any): void {
    this.broadcast({
      type: "statistics_update",
      statistics,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  close(): void {
    for (const ws of this.connections) {
      try {
        ws.close();
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
    }
    this.connections.clear();
  }
}
