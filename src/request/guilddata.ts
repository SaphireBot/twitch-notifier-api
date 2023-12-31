import { Request, Response } from "express";
import TwitchManager from "../manager";
import { env } from "process";

export default async function guilddata(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send([]);

    const guildId = req.headers.guildid as string | undefined;
    if (
        !guildId
        || typeof guildId !== "string"
    ) return res.send([]);

    const data = TwitchManager.getAllNotifiersFromThisGuild(guildId);
    return res.send(data);

}