import { OpenAPIClient } from "node-switchbot/dist/api.js";

const token = process.env.SWITCHBOT_TOKEN;
const secret = process.env.SWITCHBOT_SECRET;

if (!token || !secret) {
    console.error(
        "Please provide SWITCHBOT_TOKEN and SWITCHBOT_SECRET in the .env file",
    );
    process.exit(1);
}

const client = new OpenAPIClient(token, secret);

const { deviceList, infraredRemoteList } = await client.getDevices();

console.info("[INFO] Physical devices:");
for (const device of deviceList) {
    console.info(
        `  ${device.deviceName} (${device.deviceType}) - deviceId: ${device.deviceId}`,
    );
}

console.info("\n[INFO] Infrared remote devices:");
for (const remote of infraredRemoteList ?? []) {
    console.info(
        `  ${remote.deviceName} (${remote.remoteType}) - deviceId: ${remote.deviceId}`,
    );
}
