interface ImportMetaEnv {
    [key: string]: string;
}


export const getEnvVar = (key: keyof ImportMetaEnv, _default?: string): string => {
    const value = process.env[key];
    if (!value) {
        if (_default) {
            console.error(`Missing environment variable: ${key}`);
            return _default;
        }

        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
};