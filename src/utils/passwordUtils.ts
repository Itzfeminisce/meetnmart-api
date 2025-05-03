import CryptoJS from 'crypto-js'
import { getEnvVar } from './env'

export const decodePassword = (password: string) => {
    const decrypted = CryptoJS.AES.decrypt(
        password,
        String(getEnvVar("CRYPTOJS_KEY"))
    ).toString(CryptoJS.enc.Utf8)

    return decrypted
}

export const encryptPassword = (password: string) => {
    const encrypted = CryptoJS.AES.encrypt(
        password,
        String(getEnvVar("CRYPTOJS_KEY"))
    ).toString();

    return encrypted
}

export const comparePassword = (password: string, hashedPassword: string) => {
    return decodePassword(hashedPassword) === password
}
