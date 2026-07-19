import { Hono } from "hono";
import { OpenAPIClient } from "node-switchbot/dist/api.js";

const hostname = process.env.HOSTNAME;
const port = Number(process.env.PORT);

const token = process.env.SWITCHBOT_TOKEN;
const secret = process.env.SWITCHBOT_SECRET;

const deviceId = process.env.DEVICE_ID;

if (!hostname || !port || !token || !secret || !deviceId) {
    console.error(
        "Please provide HOSTNAME and PORT and SWITCHBOT_TOKEN and SWITCHBOT_SECRET and DEVICE_ID in the .env file",
    );
    process.exit(1);
}

const client = new OpenAPIClient(token, secret);

type Mode = "auto" | "cool" | "dry" | "fan" | "heat";
type FanSpeed = "auto" | "low" | "medium" | "high";
type Power = "on" | "off";

const MODE_CODE: Record<Mode, number> = {
    auto: 1,
    cool: 2,
    dry: 3,
    fan: 4,
    heat: 5,
};
const FAN_SPEED_CODE: Record<FanSpeed, number> = {
    auto: 1,
    low: 2,
    medium: 3,
    high: 4,
};

const state: {
    temperature: number;
    mode: Mode;
    fanSpeed: FanSpeed;
    power: Power;
} = {
    temperature: 26,
    mode: "cool",
    fanSpeed: "auto",
    power: "on",
};

function isMode(value: string): value is Mode {
    return value in MODE_CODE;
}
function isFanSpeed(value: string): value is FanSpeed {
    return value in FAN_SPEED_CODE;
}

async function applyState() {
    const parameter = `${state.temperature},${MODE_CODE[state.mode]},${FAN_SPEED_CODE[state.fanSpeed]},${state.power}`;
    console.info(`[INFO] Sending setAll: ${parameter}`);
    return client.sendCommand(deviceId!, "setAll", parameter);
}

const app = new Hono();

app.get("/", (c) => {
    return c.json(state);
});

app.get("/power", (c) => {
    return c.text(state.power);
});
app.all("/power/:power", async (c) => {
    const power = c.req.param("power");
    if (power !== "on" && power !== "off") {
        return c.text("[ERROR] power must be 'on' or 'off'", 400);
    }
    state.power = power;
    await applyState();
    return c.text("OK");
});

app.get("/temperature", (c) => {
    return c.text(state.temperature.toString());
});
app.all("/temperature/:temperature", async (c) => {
    const temperature = Number(c.req.param("temperature"));
    if (!Number.isFinite(temperature) || temperature < 16 || temperature > 30) {
        return c.text("[ERROR] temperature must be a number between 16 and 30", 400);
    }
    state.temperature = temperature;
    await applyState();
    return c.text("OK");
});

app.get("/fan-speed", (c) => {
    return c.text(state.fanSpeed);
});
app.all("/fan-speed/:fanSpeed", async (c) => {
    const fanSpeed = c.req.param("fanSpeed");
    if (!isFanSpeed(fanSpeed)) {
        return c.text(
            "[ERROR] fan-speed must be one of 'auto', 'low', 'medium', 'high'",
            400,
        );
    }
    state.fanSpeed = fanSpeed;
    await applyState();
    return c.text("OK");
});

app.get("/mode", (c) => {
    return c.text(state.mode);
});
app.all("/mode/:mode", async (c) => {
    const mode = c.req.param("mode");
    if (!isMode(mode)) {
        return c.text(
            "[ERROR] mode must be one of 'auto', 'cool', 'dry', 'fan', 'heat'",
            400,
        );
    }
    state.mode = mode;
    await applyState();
    return c.text("OK");
});

app.all("/parameter/:parameter", async (c) => {
    const parameter = c.req.param("parameter");
    const parts = parameter.split(",");
    if (parts.length !== 4) {
        return c.text(
            "[ERROR] parameter must be '{temperature},{mode},{fanSpeed},{power}'",
            400,
        );
    }
    const [temperatureStr, modeStr, fanSpeedStr, power] = parts as [
        string,
        string,
        string,
        string,
    ];

    const temperature = Number(temperatureStr);
    if (!Number.isFinite(temperature) || temperature < 16 || temperature > 30) {
        return c.text("[ERROR] temperature must be a number between 16 and 30", 400);
    }

    if (!isMode(modeStr)) {
        return c.text(
            "[ERROR] mode must be one of 'auto', 'cool', 'dry', 'fan', 'heat'",
            400,
        );
    }
    const mode = modeStr;

    if (!isFanSpeed(fanSpeedStr)) {
        return c.text(
            "[ERROR] fan-speed must be one of 'auto', 'low', 'medium', 'high'",
            400,
        );
    }
    const fanSpeed = fanSpeedStr;

    if (power !== "on" && power !== "off") {
        return c.text("[ERROR] power must be 'on' or 'off'", 400);
    }

    state.temperature = temperature;
    state.mode = mode;
    state.fanSpeed = fanSpeed;
    state.power = power;
    await applyState();
    return c.text("OK");
});

console.info(`[INFO] Starting server on ${hostname}:${port}...`);

export default {
    hostname,
    port,
    fetch: app.fetch,
};
