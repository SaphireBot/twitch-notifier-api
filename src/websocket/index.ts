import { Socket } from "socket.io";
import { env } from "process";
import active from "./active";
import disable from "./disable";
import fetch from "./fetch";
import guildData from "./guilddata";
import { CallbackType } from "../@types/twitch";
import TwitchManager from "../manager";
import data from "./data";

export default async (socket: Socket) => {

    if (socket.handshake.auth?.token as string !== env.WEBSOCKET_CONNECTION_AUTHORIZATION) {
        socket.send("Bro... Who are you?");
        return socket.disconnect(true);
    }

    socket.on("active", active);
    socket.on("disable", disable);
    socket.on("fetch", fetch);
    socket.on("ping", (_, callback: CallbackType) => callback(true));
    socket.on("guildData", guildData);
    socket.on("data", data);

    socket.on("preferredLocale", (data: { guildId: string, locale: string }) => TwitchManager.guildsLocale.set(data.guildId, data.locale));

    socket.on("guildsPreferredLocale", (data: { guildId: string, locale: string }[]) => {
        for (const { guildId, locale } of data)
            TwitchManager.guildsLocale.set(guildId, locale);
    });

    socket.send(`[TWITCH WEBSOCKET] Socket ${socket.id} connected.`);
};