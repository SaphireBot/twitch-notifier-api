import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { env } from "process";
import database from "./database";
import cors from "cors";
import WebscoketConnection from "./websocket/index";
import active from "./request/active";
import disable from "./request/disable";
import streamers from "./request/streamers";
import getstreamers from "./request/get_streamers";
import execFetch from "./request/fetch";

const app = express();
app.use(express.json());
app.disable("x-powered-by");
app.use(cors({ methods: "GET,POST,DELETE",  }));

const server = createServer(app);
const ws = new Server(server);
ws.on("connection", WebscoketConnection);

app.post("/active", active);
app.post("/disable", disable);
app.get("/streamers", streamers);
app.get("/getstreamers", getstreamers);
app.get("/fetch", execFetch);
app.get("/ping", (_, res) => res.sendStatus(200));

server.listen(Number(env.SERVER_PORT || 8080), "0.0.0.0", connection);

function connection(error?: Error | null) {
    if (error) {
        console.log("Error to connect the server", error);
        return;
    }

    database.load();
    return console.log("Twitch Notifier Started");
}