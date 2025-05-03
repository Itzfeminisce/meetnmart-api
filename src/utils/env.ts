interface ImportMetaEnv {
    [key: string]: string;
}


export const getEnvVar = (key: keyof ImportMetaEnv): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
};