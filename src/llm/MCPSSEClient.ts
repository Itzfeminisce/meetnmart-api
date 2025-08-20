import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

interface ActionContext {
  dbClient: any;
  user: any;
  llmAnalyze: any;
}

export class MCPSSEClient {
  private client: Client;

  constructor(private sseUrl: string) {
  }

  // Connect using SSE transport
  async connect(): Promise<void> {
    const transport = new SSEClientTransport(new URL(this.sseUrl), {
      requestInit: {
        headers: {
          "Authorization": "Bearer SUPABASE_ACCESS_TOKEN",
          "X-Supabase-Refresh": "SUPABASE_REFRESH_TOKEN"
        }
      }
    });

    this.client = new Client({
      name: "MeetnMart MCP Client",
      version: "1.0.0",
    }, {
      capabilities: {
        tools: {}
      }
    });

    await this.client.connect(transport);
  }

  // List available tools
  async listTools() {
    return await this.client.listTools();
  }


  // Your custom wrapper
  async callTool(name: string, args: any): Promise<any> {
    try {

      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      console.log("[callToolWithContext]", { result });

      const content = (result.content as any[])?.[0];

      if (result.isError) {
        throw new Error((content?.text as string) || 'Tool execution failed');
      }

      if (content?.type === 'text') {
        try {
          return JSON.parse(content.text);
        } catch {
          return content.text;
        }
      }

      return result.content;
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}
