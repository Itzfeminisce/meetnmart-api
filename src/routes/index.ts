import { Request } from "express";
import { AccessToken } from 'livekit-server-sdk';
import { getEnvVar } from "../utils/env";


export async function createLivekitToken(req: Request) {
    const { roomName = "new-room", participantName = "meetnmart-bot"} = req.body

    const at = new AccessToken(getEnvVar("LIVEKIT_API_KEY"), getEnvVar("LIVEKIT_API_SECRET"), {
        identity: participantName,
        ttl: '10m',
    });
    // Add more explicit permissions
    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,     // Allow publishing tracks
        canSubscribe: true,   // Allow subscribing to others' tracks
    });

    return await at.toJwt();
};

