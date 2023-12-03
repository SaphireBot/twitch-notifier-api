import { Request, Response } from "express";
import TwitchManager from "../manager";
import { env } from "process";
import Database from "../database";

export default async function data(_: Request, res: Response) {

    const streamers = Array.from(TwitchManager.data.keys()).filter(Boolean);
    const client = await Database.Client.findOne({ id: env.SAPHIRE_ID });
    
    return res.json({
        notifications: client?.TwitchNotifications || 0,
        requests_awaiting: TwitchManager.requests,
        requests_made_in_this_session: TwitchManager.requests_made_in_this_session,
        guilds: Array.from(TwitchManager.guilds).filter(Boolean),
        streamers: {
            list: streamers,
            count: streamers.length,
            online: streamers.filter(str => TwitchManager.streamersOnline.has(str)),
            offline: streamers.filter(str => !TwitchManager.streamersOnline.has(str))
        }
    });
}