import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default function data(callback: CallbackType) {

    return callback({
        streamers: {
            list: Array.from(TwitchManager.data.keys()),
            count: TwitchManager.data.size,
            online: TwitchManager.streamersOnline.size,
            offline: Array.from(TwitchManager.streamers).filter(str => !TwitchManager.streamersOnline.has(str))
        },
        guildsId: Array.from(TwitchManager.guilds),
        notifications: TwitchManager.notificationsCount,
        requests: TwitchManager.requests
    });
}