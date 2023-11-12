import { Request, Response } from "express";
import TwitchManager from "../manager";
import { env } from "process";

export default function data(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send({});

    return res.json({
        streamers: {
            list: Array.from(TwitchManager.data.keys()),
            count: TwitchManager.data.size,
            online: TwitchManager.streamersOnline.size,
            offline: Array.from(TwitchManager.streamers).filter(str => !TwitchManager.streamersOnline.has(str))
        },
        guildsId: Array.from(TwitchManager.guilds),
        notifications: TwitchManager.notificationsCount,
        requests: TwitchManager.requests
    });
}