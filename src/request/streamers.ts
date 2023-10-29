import { Request, Response } from "express";
import { env } from "process";
import TwitchManager from "../manager";

export default async function disable(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send([]);

    return res.send(
        Array
            .from(TwitchManager.data.entries())
            .map(d => ({
                streamer: d[0] || "",
                channels: Object.keys(d[1] || {}).length || 0
            }))
            .filter(d => d.streamer)
    );
}