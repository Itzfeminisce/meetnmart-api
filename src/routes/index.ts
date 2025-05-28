import { Request } from "express";
import { AccessToken } from 'livekit-server-sdk';
import { getEnvVar } from "../utils/env";
import { mailerV2 } from "../utils/mailer_v2";
import { supabaseClient } from "../utils/supabase";
import { CallData, EscrowData, EscrowStatus } from "../globals";
import fileUpload from "express-fileupload";
import { InternalServerError } from "../utils/responses";


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
    console.info(`[storeTransaction#stored]`, { payload })
    const { data: { amount, call_session_id, reference = `ORDER_${Date.now()}M`, ...metadata } } = payload

    const { error } = await supabaseClient.from("transactions").insert({
        call_session_id,
        amount,
        reference,
        description: JSON.stringify({ metadata }),
    })

    if (error) throw new Error(`[storeTransaction#error]: ${error.message}`)
    console.info(`[storeTransaction#stored]`)

    return reference;
}


export async function storeNewCallSession(payload: CallData<{ call_session_id: string }>): Promise<string> {
    const { error, data } = await supabaseClient.from("call_sessions").insert({
        buyer_id: payload.caller.id,
        seller_id: payload.receiver.id,
        started_at: new Date()
    }).select("id")

    if (error) throw new Error(`[storeNewCallSession#error]: ${error.message}`)

    return data.at(0).id;
}

export async function updateCallSession(sessionId: string, payload: { ended_at?: Date, transaction_id?: string }): Promise<void> {
    const { error, data } = await supabaseClient.from("call_sessions").update(payload).eq("id", sessionId)

    if (error) throw new Error(`[updateCallSession#error]: ${error.message}`)
    console.info(`[updateCallSession#stored]`, data)
}


export async function updateTransaction(reference: string, payload: { status: EscrowStatus, call_session_id?: string; }): Promise<void> {
    const { error } = await supabaseClient.from("transactions").update(payload).eq('reference', reference)

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


export const releaseFund = async (trxId: string, userId: string, feedback?: string): Promise<{
    id: string;
    amount: number;
    status: EscrowStatus;
    user_id: string;
}> => {
    try {
        // Call the custom RPC function to handle the fund release
        const { data, error } = await supabaseClient.rpc('release_escrowed_funds', {
            p_transaction_id: trxId,
            p_user_id: userId,
            p_feedback: feedback
        });

        if (error) {
            throw new Error(`Failed to release funds: ${error.message}`);
        }

        return data;
    } catch (error) {
        console.error('Release fund error:', error);
        throw error;
    }
};

export async function fetchUserById(userId: string) {
    const { data, error } = await supabaseClient.auth.admin.getUserById(userId);

    if (error) {
        throw new Error(`Error fetching user: ${error.message}`);
    }

    return data.user;
}


export async function uploadFile(
    file: fileUpload.UploadedFile,
    uploadKey: string // e.g. `${userId}/${productId}/main.jpg`
): Promise<string> {
    try {
        // Get file buffer
        const fileBuffer = file.data;
        const contentType = file.mimetype;

        console.log({ fileBuffer, contentType });


        // Upload to Supabase Storage
        const { data, error: uploadError } = await supabaseClient.storage
            .from('products')
            .upload(uploadKey, fileBuffer, {
                contentType,
                upsert: true
            });

        if (uploadError) {
            throw uploadError;
        }

        return data?.path ?? uploadKey;
    } catch (error: any) {
        console.error('Upload error:', error.message || error);
        throw new InternalServerError("Upload failed");
    }
}