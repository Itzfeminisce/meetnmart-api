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
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6IlQxZk9IaUcremp2aUtMRGUiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NzaHVub2l0cmJmandqeHZ4dGJkLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJmMzBhZDhmMi1hYjljLTQ4MmEtODc2YS0yOGEwZTM4NmI1ZTkiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ5OTg4MTA5LCJpYXQiOjE3NDk5ODQ1MDksImVtYWlsIjoiIiwicGhvbmUiOiIxNTA4Njg0MjA5MyIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6InBob25lIiwicHJvdmlkZXJzIjpbInBob25lIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJmMzBhZDhmMi1hYjljLTQ4MmEtODc2YS0yOGEwZTM4NmI1ZTkifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvdHAiLCJ0aW1lc3RhbXAiOjE3NDk5ODQ1MDl9XSwic2Vzc2lvbl9pZCI6ImEzMWExYmQ2LWUyMjktNGY1OC1hODkwLWEyZTcxNzdhMGJlYiIsImlzX2Fub255bW91cyI6ZmFsc2V9.X-B4elg0sR8zgMEOS8RcdhZwyWRNDfoidwiXyDGRn_c",
          "X-Supabase-Refresh": "42iind6zm65x"
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
