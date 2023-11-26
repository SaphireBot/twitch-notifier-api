import { connect, set } from "mongoose";
import TwitchModel, { TwitchSchema } from "./twitch_model";
import ClientModel from "./client_model";
import { env } from "process";
import TwitchManager from "../manager";
import { NotifierData } from "../@types/twitch";
import { Collection } from "discord.js";

export default new class Database {
    Twitch = TwitchModel;
    Client = ClientModel;
    constructor() { }

    async load() {

        set("strictQuery", true);
        const response = await connect(env.DATABASE_LINK_CONNECTION)
            .then(() => {
                console.log("Database Connected");
                return true;
            })
            .catch(err => {
                console.log("Database Connect Error", err);
                return process.exit();
            });

        if (!response) {
            console.log("Database Not Connect");
            return process.exit();
        }

        const data = await this.Client.findOne({ id: env.SAPHIRE_ID });
        TwitchManager.notificationsCount = data?.TwitchNotifications || 0;

        await this.loadGuildsData();
        await TwitchManager.setTokens(data as any);
        TwitchManager.load();
        this.watch();
        return;
    }

    async loadGuildsData() {
        const data = await this.Twitch.find();

        for await (const d of data) {
            if (!d.streamer || !d.notifiers) {
                await this.Twitch.findByIdAndDelete(d._id);
                continue;
            }
            TwitchManager.data.set(d.streamer, d.notifiers);

            for (const n of Object.values(d.notifiers) as NotifierData[]) {
                if (!n.guildId) continue;
                TwitchManager.guilds.add(n.guildId);
            }
        }

        return;
    }

    async watch() {
        const ids = new Set<any>();
        const documentId = new Map<string, string>();

        return TwitchModel.watch()
            .on("change", async (change) => {

                if (["invalidate"].includes(change.operationType)) return;

                if (change.operationType === "drop")
                    return TwitchManager.data = new Collection();

                if (change.operationType === "insert") {
                    const document = change.fullDocument as TwitchSchema;
                    if (!document.streamer) return;
                    TwitchManager.data.set(document.streamer, document.notifiers || {});
                }

                if (change.operationType === "update") {

                    const documentIdObjectToString = change.documentKey._id.toString() as string;

                    if (ids.size)
                        return ids.add(documentIdObjectToString);

                    ids.add(documentIdObjectToString);
                    setTimeout(async () => {
                        if (!ids.size) return;
                        const allDocumentsId = Array.from(ids);
                        ids.clear();
                        const documents = await this.Twitch.find({ _id: { $in: allDocumentsId } });

                        for await (const doc of documents)
                            if (doc?.streamer) {
                                TwitchManager.data.set(doc.streamer, doc.notifiers);
                                for (const data of Object.values(doc.notifiers as NotifierData[]))
                                    TwitchManager.tempChannelsNotified.delete(`${doc.streamer}.${data.channelId}`);
                                documentId.set(documentIdObjectToString, doc.streamer);
                            }
                    }, 1000);
                    return;
                }

                if (change.operationType === "delete") {
                    const documentId = change.documentKey._id.toString();
                    const streamer = documentId.get(documentId);
                    if (!streamer) return;
                    documentId.delete(documentId);
                    return TwitchManager.data.delete(streamer);
                }

            });
    }
};