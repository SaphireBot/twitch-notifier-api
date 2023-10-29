import { Socket } from "socket.io";
import { env } from "process";
import active from "./active";
import disable from "./disable";
import { UpdateStreamerParams, CallbackType, RemoveChannelParams } from "../@types/twitch";

export default async (socket: Socket) => {

    if (socket.handshake.auth?.token as string !== env.WEBSOCKET_CONNECTION_AUTHORIZATION) {
        socket.send("Bro... Who are you?");
        return socket.disconnect(true);
    }

    socket.on("active", async (data: UpdateStreamerParams, callback: CallbackType) => active(data, callback));
    socket.on("disable", async (data: RemoveChannelParams, callback: CallbackType) => disable(data, callback));
};