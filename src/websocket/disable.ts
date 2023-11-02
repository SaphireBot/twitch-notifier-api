import { CallbackType, RemoveChannelParams } from "../@types/twitch";
import Database from "../database";
import TwitchManager from "../manager";

export default async (data: RemoveChannelParams, callback: CallbackType) => {

    if (
        !data
        || typeof data === "string"
    ) return callback(false);

    for (const key of ["streamer", "channelId"])
        if (!(key in data)) return callback(false);

    TwitchManager.retryAfter.delete(`${data.streamer}.${data.channelId}`);
    TwitchManager.tempChannelsNotified.delete(`${data.streamer}.${data.channelId}`);

    return await Database.Twitch.updateOne(
        { streamer: data.streamer },
        { $unset: { [`notifiers.${data.channelId}`]: true } },
        { new: true, upsert: true }
    )
        .then(() => callback(true))
        .catch(err => {
            console.log(err);
            return callback(false);
        });
};