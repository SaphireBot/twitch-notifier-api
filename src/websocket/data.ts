import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default function data(_: any, callback: CallbackType) {
    return callback({
        streamers: {
            list: Array.from(TwitchManager.data.keys()),
            count: TwitchManager.data.size,
            online: Object.keys(TwitchManager.streamersOnline),
            offline: Object.keys(TwitchManager.streamers).filter(streamer => !TwitchManager.streamersOnline.has(streamer))
        },
        guildsId: Array.from(TwitchManager.guilds),
        notifications: TwitchManager.notificationsCount,
        requests: TwitchManager.requests
    });
}