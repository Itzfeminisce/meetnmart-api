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


export async function storeTransaction(payload: EscrowData) {
    const reference = payload.data.reference || `ORDER_${Date.now()}M`
    const { error } = await supabaseClient.from("transactions").insert({
        buyer_id: payload.caller.id,
        seller_id: payload.receiver.id,
        amount: payload.data.amount,
        reference,
        description: JSON.stringify({
            itemTitle: payload.data.itemTitle,
            itemDescription: payload.data.itemDescription,
            ...payload.data
        }),
    })

    if (error) throw new Error(`[storeTransaction#error]: ${error.message}`)
    console.info(`[storeTransaction#stored]`)

    return reference;
}


export async function updateTransaction(reference: string, payload: { status: EscrowStatus }) {
    const { error } = await supabaseClient.from("transactions").update({
        status: payload.status
    }).eq('reference', reference)

    if (error) throw new Error(`[updateTransaction#error]: ${error.message}`)
    console.info(`[updateTransaction#updated]`)
}

export async function updateWallet(userId: string, payload: { balance?: number; escrowed_balance?: number }) {
    const { error } = await supabaseClient.rpc('update_wallet_balance', {
        p_user_id: userId,
        p_balance_delta: payload.balance ?? 0,
        p_escrowed_delta: payload.escrowed_balance ?? 0,
    });

    if (error) throw new Error(`[updateWallet#error]: ${error.message}`);
    console.info(`[updateWallet#updated]`);
}