import { Request } from "express"

export function createLLMContext(req: Request) {
    return {
        user: req.user,
        dbClient: req.client,
        mcpClient: req.mcpClient
    };
}
