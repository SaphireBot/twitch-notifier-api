import { Request, Response } from "express";
import { env } from "process";
import TwitchManager from "../manager";

export default async function active(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send("unauthorized");

    return res.send(
        await TwitchManager.fetcher(`https://api.twitch.tv/helix/users?${req.url.replace("/getstreamers?", "")}`)
    );
}