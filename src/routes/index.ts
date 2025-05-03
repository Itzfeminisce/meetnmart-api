import { Request } from "express";
import { AccessToken } from 'livekit-server-sdk';
import { getEnvVar } from "src/utils/env";


export async function createLivekitToken(req: Request) {
    const { roomName = "new-room", participantName = "meetnmart-bot", isHost = false } = req.body

    const at = new AccessToken(getEnvVar("LIVEKIT_API_KEY"), getEnvVar("LIVEKIT_API_SECRET"), {
        identity: participantName,
        ttl: '10m',
    });
    at.addGrant({ roomJoin: true, room: roomName });

    return  await at.toJwt();
};

