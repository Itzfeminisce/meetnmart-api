import { Request } from "express";
import { AccessToken } from 'livekit-server-sdk';
import { getEnvVar } from "../utils/env";
import { mailerV2 } from "../utils/mailer_v2";
import { supabaseClient } from "../utils/supabase";


export async function createLivekitToken(req: Request) {
    const { roomName = "new-room", participantName = "meetnmart-bot" } = req.body

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


export async function notifyWaitlistUser(req: Request) {
    const { email, role } = req.body;

    if (!email || !role) {
        throw new Error('Email and role are required');
    }

    // Validate email format with a basic regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }

    // Validate user type
    if (role.toLowerCase() !== 'buyer' && role.toLowerCase() !== 'seller') {
        throw new Error('User type must be either "buyer" or "seller"');
    }

    const { error: insertError } = await supabaseClient.from('waitlist').insert([
        {
            email,
            role
        }
    ]);

    if (insertError) {
        if (insertError.code === '23505') {
            return 'You are already on our waitlist!';
        }
    }

    await mailerV2.sendTemplateEmail({
        to: email,
        subject: `Welcome to MeetnMart - Your ${role.charAt(0).toUpperCase() + role.slice(1)} Account is Ready!`,
        template: 'waitlist-notification',
        userType: role.charAt(0).toUpperCase() + role.slice(1),
        recipientEmail: email // Used for unsubscribe link
    });

    return true;
}
