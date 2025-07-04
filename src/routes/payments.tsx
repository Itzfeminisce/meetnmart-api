import express, { Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { asyncHandler } from "../utils/asyncHandlerUtils";
import WalletTransferService from "../services/walletService";
import { z } from "zod";
import { generateTransactionReference } from "../utils/commonUtils";
import { BadRequest, Forbidden, InternalServerError } from "../utils/responses";
import { NotificationHandler } from "../core/notification/handler";
import { updateWallet } from ".";
import { WITHDRAWAL_STATUS } from "../services/types";
import { logger } from "../logger";

const router = express.Router();

// Initialize Paystack service (uses env by default)
const walletService = new WalletTransferService({
    isProduction: false,
})

/**
 * @route   GET /payments/banks
 * @desc    List banks available for recipient creation (Paystack)
 * @query   country (optional, default: 'nigeria')
 */
router.get("/banks", authenticate(), asyncHandler(async (req: Request, res: Response) => {
    const country = req.query.country ? String(req.query.country) : 'nigeria';
    const response = await walletService['paystack'].listBanks(country);
    return res.json(response);
}));


/**
 * @route   POST /payments/recipient
 * @desc    Create a Paystack transfer recipient
 * @body    { type, name, account_number, bank_code, currency, description }
 */
router.post("/recipient", authenticate(), asyncHandler(async (req: Request, res: Response) => {
    const payload = z.object({
        amount: z.coerce.number(), account_name: z.string(), account_number: z.string(), bank_code: z.string(), bank_name: z.string()
    }).parse(req.body)


    const { user, client } = req

    const { data: wallet, error: walletErr } = await client.from("wallets").select("balance").eq("user_id", user.id).single()


    if (walletErr) throw new InternalServerError("Failed to retrieve wallet info")

    if (payload.amount > wallet.balance) {
        throw new BadRequest("Insufficient Balance", "Requested amount is more than available balance")
    }

    const withdrawal_data = {
        user_id: user.id,
        amount: payload.amount,
        bank_code: payload.bank_code,
        account_number: payload.account_number,
        account_name: payload.account_name,
        reference: generateTransactionReference()
    } as any

    // const response = await walletService.processWithdrawal(user.id, {
    //     amount: withdrawal_data.amount,
    //     bankDetails: {
    //         account_name: withdrawal_data.account_name,
    //         account_number: withdrawal_data.account_number,
    //         bank_code: withdrawal_data.bank_code
    //     },
    //     reason: "Wallet Withdrawal",
    //     reference: withdrawal_data.reference
    // })

    // if (!response.success) {
    //     throw new Forbidden(response.error)
    // }

    const _withdrawal_data = {
        ...withdrawal_data,
        metadata: {
            bank_name: payload.bank_name,
            ...wallet
        },
        // status: response.status
    }


    const { error } = await client.from("withdrawals").insert(_withdrawal_data)

    if (error) throw new InternalServerError("Failed to create withdrawal. Please try again")

    const { error: walletError } = await client.from("wallets").update({ balance: wallet.balance - payload.amount }).eq("user_id", user.id)

    if (walletError) {
        logger.error("Failed to debit user wallet", walletError, {
            ..._withdrawal_data
        })
        // if we are not able to debit the wallet, the transaction is canceled
        await client.from("withdrawals").update({
            status: WITHDRAWAL_STATUS.Cancelled, failure_reason: JSON.stringify({
                why: "Unable to debit wallet",
                error: String(error)
            })
        }).eq("reference", withdrawal_data.reference)
    }


    const notification = new NotificationHandler()


    notification.sendNotification({
        recipient_id: user.id,
        sender_id: user.id,
        title: "Withdrawal Request",
        type: "payment",
        description: "Your withdrawal request has been submitted and now pending approval. This usually takes an hour or less. Thank you for using MeetnMart",
        metadata: {
            email_notification_template_variant: "request",
            ..._withdrawal_data,
        }
    })


    return { user_id: user.id, message: "Withdrawal has been submitted." }
}));
router.post("/otp/finalize", authenticate(), asyncHandler(async (req: Request, res: Response) => {
    const payload = z.object({
        amount: z.coerce.number(), account_name: z.string(), account_number: z.string(), bank_code: z.string()
    }).parse(req.body)


    const { user, client } = req


    // withdrawal status: 'pending' | 'processing' | 'failed' | 'completed'
    // method: 'bank' | 'crypto'

    const withdrawal_data = {
        user_id: user.id,
        amount: payload.amount,
        bank_code: payload.bank_code,
        account_number: payload.account_number,
        account_name: payload.account_name,
        reference: generateTransactionReference()
    }

    const { error } = await client.from("withdrawals").insert(withdrawal_data)


    const response = await walletService.processWithdrawal(user.id, {
        amount: withdrawal_data.amount,
        bankDetails: {
            account_name: withdrawal_data.account_name,
            account_number: withdrawal_data.account_number,
            bank_code: withdrawal_data.bank_code
        },
        reason: "Wallet Withdrawal",
        reference: withdrawal_data.reference
    })
    return response
}));

// /**
//  * @route   POST /payments/transfer
//  * @desc    Initiate a Paystack transfer
//  * @body    { source, amount, recipient, reason, currency, reference }
//  */
// router.post("/transfer", authenticate(), asyncHandler(async (req: Request, res: Response) => {
//     const paystack = createWalletTransfer();
//     const transferData = req.body;
//     const response = await walletService.initiateTransfer(transferData);
//     return response
// }));

// /**
//  * @route   GET /payments/transfer/:reference/verify
//  * @desc    Verify a Paystack transfer by reference
//  */
// router.get("/transfer/:reference/verify", authenticate(), asyncHandler(async (req: Request, res: Response) => {
//     const paystack = createWalletTransfer();
//     const { reference } = req.params;
//     const response = await paystack.verifyTransfer(reference);
//     return response
// }));


export { router as PaymentRouter };
