import { Request, Response } from "express";
import { UpdateStreamerParams } from "../@types/twitch";
import { env } from "process";
import Database from "../database";

export default async function active(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_ID)
        return res.send("unauthorized");

    const data = req.body as UpdateStreamerParams;
    if (!data) return res.send("missing content data");

    for (const key of ["streamer", "channelId", "guildId"])
        if (!(key in req.body)) return res.send("missing content");

    await Database.Twitch.updateOne(
        { streamer: data.streamer },
        { $unset: { [`notifiers.${data.data.channelId}`]: true } }
    );

    return await Database.Twitch.updateOne(
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
        .then(() => res.send(true))
        .catch(err => {
            console.log(err);
            return res.send(false);
        });

}