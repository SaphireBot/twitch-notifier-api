import { CallbackType, UpdateStreamerParams } from "../@types/twitch";
import Database from "../database";
import TwitchManager from "../manager";

export default async (data: UpdateStreamerParams, callback: CallbackType) => {
    if (!data) return callback("missing content data");

    for (const key of ["streamer", "channelId", "guildId"])
        if (!(key in data)) return callback("missing content");

    await Database.Twitch.updateOne(
        { streamer: data.streamer },
        { $unset: { [`notifiers.${data.channelId}`]: true } }
    );

    return await Database.Twitch.updateOne(
        { streamer: data.streamer },
        {
            $set: {
                [`notifiers.${data.channelId}`]: {
                    channelId: data.channelId,
                    guildId: data.guildId,
                    notified: false,
                    roleId: data.roleId,
                    message: data.message
                }
            }
        },
        { new: true, upsert: true }
    )
        .then(() => {
            TwitchManager.data.set(data.streamer, { [data.channelId]: data });
            TwitchManager.tempChannelsNotified.delete(`${data.streamer}.${data.channelId}`);
            return callback(true);
        })
        .catch(err => {
            console.log(err);
            return callback(false);
        });


};