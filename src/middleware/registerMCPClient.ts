import { NextFunction, Request, Response } from "express"
import { MCPSSEClient } from "../llm/MCPSSEClient";


const sseClient = new MCPSSEClient("http://localhost:4041/mcp");


export const registerMCPClient = () => async (req: Request, res: Response, next: NextFunction) => {
    await sseClient.connect()
    req.mcpClient = sseClient
    next()
}