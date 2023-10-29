import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default async function active(query: string, callback: CallbackType) {
    return callback(
        await TwitchManager.fetcher(`https://api.twitch.tv/helix/users?${query}`)
    );
}