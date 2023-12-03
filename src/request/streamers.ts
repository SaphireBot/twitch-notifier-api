import { Request, Response } from "express";
import TwitchManager from "../manager";

export default async function streamers(_: Request, res: Response) {

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