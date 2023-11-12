import { Request, Response } from "express";
import TwitchManager from "../manager";
import { env } from "process";

export default function data(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send({
            streamers: {
                list: [],
                count: 0,
                online: [],
                offline: []
            },
            guildsId: [],
            notifications: 0,
            requests: 0
        });

    const streamers = Array.from(TwitchManager.data.keys()).filter(Boolean);
    
    return res.json({
        streamers: {
            list: streamers,
            count: streamers.length,
            online: streamers.filter(str => TwitchManager.streamersOnline.has(str)),
            offline: streamers.filter(str => !TwitchManager.streamersOnline.has(str)),
        },
        guildsId: Array.from(TwitchManager.guilds).filter(Boolean),
        notifications: TwitchManager.notificationsCount,
        requests: TwitchManager.requests
    });
}