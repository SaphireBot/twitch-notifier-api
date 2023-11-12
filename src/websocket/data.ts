import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default function data(_: any, callback: CallbackType) {

    const streamers = Array.from(TwitchManager.data.keys()).filter(Boolean);
    return callback({
        streamers: {
            list: streamers,
            count: streamers.length,
            online: streamers.filter(str => TwitchManager.streamersOnline.has(str)),
            offline: streamers.filter(str => !TwitchManager.streamersOnline.has(str)),
        },
        guildsId: Array.from(TwitchManager.guilds).filter(Boolean),
        notifications: TwitchManager.notificationsCount,
        requests: TwitchManager.requests
    });
}