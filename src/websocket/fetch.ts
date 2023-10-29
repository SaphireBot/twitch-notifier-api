import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default async function execFetch(url: string, callback: CallbackType) {
    return callback(await TwitchManager.fetcher(url));
}