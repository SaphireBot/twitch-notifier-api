import { Request, Response } from "express";
import { env } from "process";
import Database from "../database";

export default async function disable(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_ID)
        return res.send(false);

    const data = req.body as { streamer: string, channelId: string };
    if (!data) return res.send(false);

    for (const key of ["streamer", "channelId"])
        if (!(key in data)) return res.send(false);

    return await Database.Twitch.updateOne(
        { streamer: data.streamer },
        { $unset: { [`notifiers.${data.channelId}`]: true } },
        { new: true, upsert: true }
    )
        .then(() => res.send(true))
        .catch(err => {
            console.log(err);
            return res.send(false);
        });

}