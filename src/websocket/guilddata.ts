import { CallbackType } from "../@types/twitch";
import TwitchManager from "../manager";

export default async function guildData(guildId: string, callback: CallbackType) {
    return callback(TwitchManager.getAllNotifersFromThisGuild(guildId));
}