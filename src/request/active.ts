import { Request, Response } from "express";
import { UpdateStreamerParams } from "../@types/twitch";
import { env } from "process";
import Database from "../database";
import TwitchManager from "../manager";

export default async function active(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_ID)
        return res.send("unauthorized");

    const data = req.body as UpdateStreamerParams;
    if (!data) return res.send("missing content data");

    for (const key of ["streamer", "channelId", "guildId"])
        if (!(key in data)) return res.send("missing content");

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
            return res.send(true);
        })
        .catch(err => {
            console.log(err);
            return res.send(false);
        });

}