// Backend LLM Router
import OpenAI from 'openai';
import { UserType } from '../globals';
import { createLLMContext } from '../utils/helpers';

interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

export class LLMRouter {
  private openai: OpenAI;
  private mcpClient: ReturnType<typeof createLLMContext>['mcpClient'];  

  constructor(private openaiKey: string, private mcpContext: ReturnType<typeof createLLMContext>) {
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.mcpClient = mcpContext.mcpClient;
  }

  async processUserPrompt(prompt: string) {
    try {
      // Get available tools from MCP server
      const availableTools = await this.mcpClient.listTools();

      // Convert to OpenAI function format
      const functions = availableTools.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }));

      console.log({functions, availableTools});
      

      const user = this.mcpContext.user
      const userType = user.role


      const MEETNMART_SYSTEM_PROMPT = ` 
            You are MeetnMart assistant. Convert user requests to function calls.
            User: ${userType} at location ${user.location}
            STRICT RULES:
            - NEVER suggest external apps/services
            - ALWAYS keep solutions within MeetnMart ecosystem
            - When primary tool returns empty/insufficient results, intelligently choose alternative tools

            Available tools: \n${functions.join("\n")}`;
            // Available tools: \n${functions.map((f) => `Name: ${f.name}\nDescription:${f.description}`).join(',\n\n ')}`;

            console.log({MEETNMART_SYSTEM_PROMPT});
            

      // Ask LLM to determine which tool to call
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: MEETNMART_SYSTEM_PROMPT
          },
          { role: "user", content: prompt }
        ],
        tools: functions.map((f: any) => ({ type: "function", function: f })),
        tool_choice: "auto"
      });
      
      
      const message = response.choices[0].message;
      console.log({ResponseFromAI: message});

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const functionCall = toolCall.function;

        // Execute MCP tool
        const result = await this.mcpClient.callTool(
          functionCall.name,
          {
            ...JSON.parse(functionCall.arguments),
            ...this.mcpContext
          },
        );

        // Generate natural language response
        const NATUAL_LANGUAGE_PROMPT = `
        Convert this data to a natural, helpful response for the user. Be conversational and highlight key information like distances, ratings, and availability.

        STRICT RULES:
              1. NEVER suggest external apps or services.
              2. ALWAYS keep solutions within the MeetnMart ecosystem.
              3. If no internal data is available, do NOT refer to external services, providers or anything     
                  outside MeetnMart
              Instead: 
                • Say “I’m sorry, I couldn’t find any matches right now. Could you refine what you’re looking for?” or 
                • Offer a related MeetnMart feature (e.g. “Would you like me to notify you when a seller matching X becomes available?”).
`
        const naturalResponse = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: NATUAL_LANGUAGE_PROMPT
            },
            {
              role: "user",
              content: `Original request: ${prompt}\nData: ${JSON.stringify(result)}`
            }
          ]
        });

        return {
          toolUsed: functionCall.name,
          rawData: result,
          naturalResponse: naturalResponse.choices[0].message.content
        };
      }

      // Fallback for general chat
      const chatResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are MeetnMart assistant. Be helpful and marketplace-focused. If users ask about products or sellers, suggest they be more specific about what they're looking for."
          },
          { role: "user", content: prompt }
        ]
      });

      return {
        naturalResponse: chatResponse.choices[0].message.content
      };
    } catch (error) {
      console.error('Error processing user prompt:', error);
      return {
        naturalResponse: "I'm sorry, I encountered an error processing your request. Please try again or be more specific about what you're looking for.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Usage in your API endpoint
// app.post('/ai', async (req, res) => {
//   const { message } = req.body;
//   const user = req.user;
//
//   const mcpClient = new MeetnMartMCPServer();
//   mcpClient.seedSampleData(); // Initialize with sample data
//
//   const router = new MeetnMartLLMRouter(process.env.OPENAI_API_KEY, mcpClient);
//   const response = await router.processUserPrompt(message, user.id, user.role, {
//     lat: user.lat,
//     lng: user.lng
//   });
//
//   res.json(response);
// });