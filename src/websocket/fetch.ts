import TwitchManager from "../manager";
import { CallbackType } from "../@types/twitch";

export default async function execFetch(url: string, callback: CallbackType) {

    if (!url) return callback("missing url");

    const response = await TwitchManager.fetcher(url);
    if (typeof response === "number") return callback({ total: response });

    return callback(response);
}