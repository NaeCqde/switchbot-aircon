import { Hono } from 'hono';
import { OpenAPIClient } from 'node-switchbot/dist/api.js';

import { getUserInfo, HEADERS, login, refreshToken } from './account.js';

const [hostname, portStr] = process.env.LISTEN?.split(':') ?? [];
const port = Number(portStr);

const token = process.env.SWITCHBOT_TOKEN;
const secret = process.env.SWITCHBOT_SECRET;

const email = process.env.SWITCHBOT_EMAIL;
const password = process.env.SWITCHBOT_PASSWORD;

const deviceId = process.env.DEVICE_ID;

if (!hostname || !port || !token || !secret || !email || !password || !deviceId) {
    console.error(
        'Please provide LISTEN and SWITCHBOT_TOKEN and SWITCHBOT_SECRET and DEVICE_ID in the .env file',
    );
    process.exit(1);
}

type Mode = 'auto' | 'cool' | 'dry' | 'fan' | 'heat';

type State = {
    temperature: number; // 16-30
    mode: Mode;
    fanSpeed: number; //0 auto, 1-5
    power: boolean; // true = on, false = off
};

const MODE_CODE: Record<Mode, number> = {
    auto: 1,
    cool: 2,
    dry: 3,
    fan: 4,
    heat: 5,
};

let loginAt = Date.now();
let refreshedAt = loginAt;
let account = await login(email, password);
const { userId, email: _email } = await getUserInfo(account.accessToken);
console.info('[INFO] Logged in as ' + _email + ' (' + userId + ')');

const client = new OpenAPIClient(token, secret);
let state: State = await getAirConStatus(true);

async function getAirConStatus(first: boolean = false): Promise<State> {
    if (Date.now() > refreshedAt + account.expiresIn * 1000) {
        if (Date.now() > loginAt + account.refreshExpiresIn * 1000) {
            loginAt = Date.now();
            refreshedAt = loginAt;
            account = await login(email, password, account.deviceId);
        } else {
            refreshedAt = Date.now();
            const refreshed = await refreshToken(userId, account.deviceId, account.refreshToken);
            account.accessToken = refreshed.accessToken;
            account.expiresIn = refreshed.expiresIn;
        }
    }

    const response = await fetch(
        'https://wonder.ap.api.switchbot.net/homepage/v1/device/remoteinfo',
        {
            method: 'POST',
            headers: {
                ...HEADERS,
                Authorization: account.accessToken,
            },
            body: JSON.stringify({
                remoteID: deviceId,
            }),
        },
    );

    if (!response.ok) {
        throw Error(
            `[ERROR] Failed to get aircon status: ${response.status} ${response.statusText}`,
        );
    }

    const json = await response.json();
    const live = json['data']['remoteStatus'];
    if (live['temperature'] === -100) {
        if (first) {
            live['temperature'] = 16;
        } else {
            live['temperature'] = state.temperature;
        }
    }
    live['mode'] = Object.keys(MODE_CODE).find(
        (key) => MODE_CODE[key as Mode] === live['mode'],
    ) as Mode;
    live['fanSpeed']--; // Convert fan speed from 1-6 (1 is auto) to 0-5 (0 is auto)
    live['power'] = Boolean(live['power']); // Convert power from 1/0 to boolean
    return live;
}

function isMode(value: string): value is Mode {
    return value in MODE_CODE;
}

async function applyState() {
    const parameter = `${state.temperature},${MODE_CODE[state.mode]},${state.fanSpeed + 1},${state.power ? 'on' : 'off'}`;
    return client.sendCommand(deviceId, 'setAll', parameter);
}

const app = new Hono();

app.get('/', async (c) => {
    try {
        state = await getAirConStatus();
        return c.json(state);
    } catch (error: any) {
        console.error(error);
        return c.json(state);
    }
});

app.get('/power', async (c) => {
    try {
        state = await getAirConStatus();
        return c.text(state.power ? 'on' : 'off');
    } catch (error: any) {
        console.error(error);
        return c.text(state.power ? 'on' : 'off');
    }
});
app.all('/power/:power', async (c) => {
    const power = c.req.param('power');
    if (power !== 'on' && power !== 'off') {
        return c.text("[ERROR] power must be 'on' or 'off'", 400);
    }

    console.info('[INFO] Changing aircon power to ' + power + ' for device ' + deviceId);

    state.power = power === 'on';
    await applyState();
    return c.text('OK');
});

app.get('/temperature', async (c) => {
    try {
        state = await getAirConStatus();
        return c.text(state.temperature.toString());
    } catch (error: any) {
        console.error(error);
        return c.text(state.temperature.toString());
    }
});
app.all('/temperature/:temperature', async (c) => {
    const temperature = Number(c.req.param('temperature'));
    if (!Number.isFinite(temperature) || temperature < 16 || temperature > 30) {
        return c.text('[ERROR] temperature must be a number between 16 and 30', 400);
    }

    console.info(
        '[INFO] Changing aircon temperature to ' + temperature + ' for device ' + deviceId,
    );

    state.temperature = temperature;
    await applyState();
    return c.text('OK');
});

app.get('/fan-speed', async (c) => {
    try {
        state = await getAirConStatus();
        return c.text(state.fanSpeed.toString());
    } catch (error: any) {
        console.error(error);
        return c.text(state.fanSpeed.toString());
    }
});
app.all('/fan-speed/:fanSpeed', async (c) => {
    const fanSpeed = Number(c.req.param('fanSpeed') || NaN);
    if (!Number.isInteger(fanSpeed) || fanSpeed < 0 || fanSpeed > 5) {
        return c.text('[ERROR] fan-speed must be 0 (auto) or a number between 1 and 5.', 400);
    }

    console.info('[INFO] Changing aircon fan speed to ' + fanSpeed + ' for device ' + deviceId);

    state.fanSpeed = fanSpeed;
    await applyState();
    return c.text('OK');
});

app.get('/mode', async (c) => {
    try {
        state = await getAirConStatus();
        return c.text(state.mode);
    } catch (error: any) {
        console.error(error);
        return c.text(state.mode);
    }
});
app.all('/mode/:mode', async (c) => {
    const mode = c.req.param('mode');
    if (!isMode(mode)) {
        return c.text("[ERROR] mode must be one of 'auto', 'cool', 'dry', 'fan', 'heat'", 400);
    }

    console.info('[INFO] Changing aircon mode to ' + mode + ' for device ' + deviceId);

    state.mode = mode;
    await applyState();
    return c.text('OK');
});

app.all('/parameter/:parameter', async (c) => {
    const parameter = c.req.param('parameter');
    const parts = parameter.split(',');
    if (parts.length !== 4) {
        return c.text("[ERROR] parameter must be '{temperature},{mode},{fanSpeed},{power}'", 400);
    }
    const [temperatureStr, modeStr, fanSpeedStr, power] = parts as [string, string, string, string];

    const temperature = Number(temperatureStr);
    if (!Number.isFinite(temperature) || temperature < 16 || temperature > 30) {
        return c.text('[ERROR] temperature must be a number between 16 and 30', 400);
    }

    if (!isMode(modeStr)) {
        return c.text("[ERROR] mode must be one of 'auto', 'cool', 'dry', 'fan', 'heat'", 400);
    }
    const mode = modeStr;

    const fanSpeed = Number(fanSpeedStr || NaN);
    if (!Number.isInteger(fanSpeed) || fanSpeed < 0 || fanSpeed > 5) {
        return c.text('[ERROR] fan-speed must be 0 (auto) or a number between 1 and 5.', 400);
    }

    if (power !== 'on' && power !== 'off') {
        return c.text("[ERROR] power must be 'on' or 'off'", 400);
    }

    console.info(
        `[INFO] Changing aircon parameter to ${temperature},${mode},${fanSpeed},${power} for device ${deviceId}`,
    );

    state.temperature = temperature;
    state.mode = mode;
    state.fanSpeed = fanSpeed;
    state.power = power === 'on';
    await applyState();
    return c.text('OK');
});

console.info('[INFO] AirCon Status:');
console.info(state);
console.info(`[INFO] Starting server on ${hostname}:${port}...`);

export default {
    hostname,
    port,
    fetch: app.fetch,
};
