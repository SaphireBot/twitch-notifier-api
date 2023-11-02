import { Socket } from "socket.io";
import { env } from "process";
import active from "./active";
import disable from "./disable";
import fetch from "./fetch";
import guildData from "./guilddata";
import { UpdateStreamerParams, CallbackType, RemoveChannelParams } from "../@types/twitch";

export default async (socket: Socket) => {

    if (socket.handshake.auth?.token as string !== env.WEBSOCKET_CONNECTION_AUTHORIZATION) {
        socket.send("Bro... Who are you?");
        return socket.disconnect(true);
    }

    socket.on("active", async (data: UpdateStreamerParams, callback: CallbackType) => await active(data, callback));
    socket.on("disable", async (data: RemoveChannelParams, callback: CallbackType) => await disable(data, callback));
    socket.on("fetch", async (url: string, callback: CallbackType) => await fetch(url, callback));
    socket.on("ping", (_: string, callback: CallbackType) => callback(true));
    socket.on("guildData", (guildId: string, callback: CallbackType) => guildData(guildId, callback));

    socket.send(`[TWITCH WEBSOCKET] Socket ${socket.id} connected.`);
};