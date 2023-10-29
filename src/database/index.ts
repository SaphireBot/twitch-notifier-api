import { connect, set } from "mongoose";
import TwitchModel from "./twitch_model";
import ClientModel from "./client_model";
import { env } from "process";
import TwitchManager from "../manager";

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

        if (!response) return;

        await this.refresh();
        TwitchManager.load();
        this.watch();
        return;
    }

    async refresh() {
        const data = await this.Twitch.find();
        for await (const d of data) {
            if (!d.streamer || !d.notifiers) {
                await this.Twitch.findByIdAndDelete(d._id);
                continue;
            }
            TwitchManager.data.set(d.streamer, d.notifiers);
        }

        return true;
    }

    async watch() {
        const ids = new Set<any>();
        const documentId = new Map<string, string>();

        return TwitchModel.watch()
            .on("change", async (change) => {

                if (["update", "insert"].includes(change.operationType)) {

                    if (ids.size)
                        return ids.add(change.documentKey._id);

                    ids.add(change.documentKey._id);
                    setTimeout(async () => {
                        if (!ids.size) return;
                        const allDocumentsId = Array.from(ids);
                        ids.clear();
                        const documents = await this.Twitch.find({ _id: { $in: allDocumentsId } });

                        for await (const doc of documents)
                            if (doc?.streamer) {
                                TwitchManager.data.set(doc.streamer, doc.notifiers);
                                documentId.set(doc._id.toString(), doc.streamer);
                            }
                    }, 1000);
                    return;
                }

                if (change.operationType === "delete") {
                    const streamerKey = documentId.get(change.documentKey._id.toString());
                    if (!streamerKey) return;
                    documentId.delete(change.documentKey._id.toString());
                    return TwitchManager.data.delete(streamerKey);
                }

            });
    }
};