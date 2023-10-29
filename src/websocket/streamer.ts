import { env } from "process";
import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default async function disable(data: string, callback: CallbackType) {

    if (data !== env.TWITCH_CLIENT_ID)
        return callback([]);

    return callback(
        Array
            .from(TwitchManager.data.entries())
            .map(d => ({
                streamer: d[0] || "",
                channels: Object.keys(d[1] || {}).length || 0
            }))
            .filter(d => d.streamer)
    );
}