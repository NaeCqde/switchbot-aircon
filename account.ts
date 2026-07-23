import crypto from 'crypto';

// Maybe hardcoded into the iOS version of the SwitchBot app
const clientId = 'pg6fbtxbi7q3o2n4zba852d5lh';

export const HEADERS = {
    Accept: '*/*',
    'Accept-Language': 'ja',
    appVersion: '9.29',
    'Content-Type': 'application/json',
    'User-Agent': 'SwitchBot/13 CFNetwork/3890.100.1 Darwin/27.0.0',
};

type LoginApiResponse = {
    statusCode: number;
    message: string;
    body: {
        access_token: string;
        expires_in: number;
        refresh_expires_in: number;
        refresh_token: string;
        token_type: string;
    };
};

type UserInfoApiResponse = {
    statusCode: number;
    message: string;
    body: {
        botRegion: string;
        email: string;
        isVerified: boolean;
        locale: string;
        nickName: string;
        source: string;
        state: number;
        subscribe: boolean;
        userID: string;
        userName: string;
    };
};

type RefreshTokenApiResponse = {
    statusCode: number;
    message: string;
    body: {
        access_token: string;
        expires_in: number;
        token_type: string;
    };
};

export type LoginResult = {
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshExpiresIn: number;
    deviceId: string;
};

export type RefreshTokenResult = {
    accessToken: string;
    expiresIn: number;
};

export type UserInfo = {
    userId: string;
    email: string;
    nickName: string;
    botRegion: string;
    locale: string;
    isVerified: boolean;
};

export async function login(
    username: string,
    password: string,
    deviceId: string | null = null,
): Promise<LoginResult> {
    if (!deviceId) {
        deviceId = crypto.randomUUID().toUpperCase();
    }

    const response = await fetch('https://account.api.switchbot.net/account/api/v2/user/login', {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
            deviceInfo: {
                versionFlag: '9.29',
                appVersion: '9.29',
                model: '',
                deviceName: 'iPhone',
                deviceId,
            },
            username,
            password,
            grantType: 'password',
            clientId,
        }),
    });

    if (!response.ok) {
        throw new Error(`[ERROR] Failed to login: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as LoginApiResponse;
    if (json.statusCode !== 100) {
        throw new Error(`[ERROR] Failed to login: ${json.message}`);
    }

    return {
        accessToken: json.body.access_token,
        expiresIn: json.body.expires_in,
        refreshToken: json.body.refresh_token,
        refreshExpiresIn: json.body.refresh_expires_in,
        // @ts-ignore
        deviceId,
    };
}

export async function refreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string,
): Promise<RefreshTokenResult> {
    const response = await fetch(
        'https://account.api.switchbot.net/account/api/v1/user/token/refresh',
        {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                clientId,
                deviceId,
                userId,
                refreshToken,
            }),
        },
    );

    if (!response.ok) {
        throw new Error(
            `[ERROR] Failed to refresh token: ${response.status} ${response.statusText}`,
        );
    }

    const json = (await response.json()) as RefreshTokenApiResponse;
    if (json.statusCode !== 100) {
        throw new Error(`[ERROR] Failed to refresh token: ${json.message}`);
    }

    return {
        accessToken: json.body.access_token,
        expiresIn: json.body.expires_in,
    };
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch('https://account.api.switchbot.net/account/api/v1/user/userinfo', {
        method: 'POST',
        headers: {
            ...HEADERS,
            Authorization: accessToken,
        },
    });

    if (!response.ok) {
        throw new Error(
            `[ERROR] Failed to get user info: ${response.status} ${response.statusText}`,
        );
    }

    const json = (await response.json()) as UserInfoApiResponse;
    if (json.statusCode !== 100) {
        throw new Error(`[ERROR] Failed to get user info: ${json.message}`);
    }

    return {
        userId: json.body.userID,
        email: json.body.email,
        nickName: json.body.nickName,
        botRegion: json.body.botRegion,
        locale: json.body.locale,
        isVerified: json.body.isVerified,
    };
}
