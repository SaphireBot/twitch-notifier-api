import { Request, Response } from "express";
import { env } from "process";
import TwitchManager from "../manager";

export default async function execFetch(req: Request, res: Response) {

    if (req.headers.authorization !== env.TWITCH_CLIENT_SECRET)
        return res.send("unauthorized");

    const url = req.headers.url as string | undefined;
    if (!url) return res.send("missing url");

    const response = await TwitchManager.fetcher(req.headers.url as string);
    if (typeof response === "number") return res.send({ total: response });

    return res.send(response);
}