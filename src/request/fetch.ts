import { Request, Response } from "express";
import { env } from "process";
import TwitchManager from "../manager";

export default async function execFetch(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send("unauthorized");

    return res.send(await TwitchManager.fetcher(req.body.url));
}