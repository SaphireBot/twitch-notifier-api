import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";
import Database from "../database";
import { env } from "process";

export default async function data(_: any, callback: CallbackType) {

    const client = await Database.Client.findOne({ id: env.SAPHIRE_ID });
    const streamers = Array.from(TwitchManager.data.keys()).filter(Boolean);

    return callback({
        streamers: {
            list: streamers,
            count: streamers.length,
            online: streamers.filter(str => TwitchManager.streamersOnline.has(str)),
            offline: streamers.filter(str => !TwitchManager.streamersOnline.has(str)),
        },
        guildsId: Array.from(TwitchManager.guilds).filter(Boolean),
        notifications: client?.TwitchNotifications || 0,
        requests: TwitchManager.requests
    });
}