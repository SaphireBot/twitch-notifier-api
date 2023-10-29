import { CallbackType, UpdateStreamerParams } from "../@types/twitch";
import database from "../database";

export default async (data: UpdateStreamerParams, callback: CallbackType) => {

    if (!data) return callback(false);

    for (const key of ["streamer", "channelId", "guildId"])
        if (!(key in data.data)) return callback(false);

    return await database.Twitch.updateOne(
        { streamer: data.streamer },
        {
            $set: {
                [`notifiers.${data.data.channelId}`]: {
                    channelId: data.data.channelId,
                    guildId: data.data.guildId,
                    notified: false,
                    oldChannelId: data.data.oldChannelId,
                    roleId: data.data.roleId,
                    message: data.data.message
                }
            }
        },
        { new: true, upsert: true }
    )
        .then(() => callback(true))
        .catch(err => {
            console.log(err);
            return callback(false);
        });

};