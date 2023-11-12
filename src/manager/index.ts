import { env } from "process";
import Database from "../database";
import { ButtonStyle, Collection, DiscordAPIError, REST, Routes, parseEmoji, time, APIGuild } from "discord.js";
import { TwitchLanguages, emojis as e } from "../data.json";
import { StreamData, NotifierData, UserData, } from "../@types/twitch";
import { TwitchSchema } from "../database/twitch_model";
import { renewToken, checkAccessTokenAndStart } from "./tokens";
import { t } from "../translator";

const rest = new REST().setToken(env.DISCORD_TOKEN);

export default new class TwitchManager {
    declare streamers: Set<string>;
    declare data: Collection<string, Record<string, NotifierData>>;
    declare TwitchAccessToken: string | undefined | void;
    declare TwitchAccessTokenSecond: string | undefined | void;
    declare TwitchAccessTokenThird: string | undefined | void;
    declare streamersOnline: Map<string, StreamData>;
    declare streamersData: Map<string, UserData>;
    declare guildsLocale: Map<string, string>;
    declare notificationInThisSeason: number;
    declare streamersQueueCheck: string[];
    requests = 0;
    notificationsCount = 0;
    guilds = new Set<string>();
    channelsToIgnore = new Set<string>();
    tempChannelsNotified = new Set<string>();
    retryAfter = new Map<string, number>();
    sleepAccessTokens = new Set<string>();
    lastAccessToken = "";

    constructor() {
        this.streamers = new Set();
        this.streamersOnline = new Map();
        this.streamersData = new Map();
        this.data = new Collection();
        this.TwitchAccessToken = undefined;
        this.TwitchAccessTokenSecond = undefined;
        this.TwitchAccessTokenThird = undefined;
        this.notificationInThisSeason = 0;
        this.streamersQueueCheck = [];
        this.guildsLocale = new Map();
    }

    async load(): Promise<any> {
        await this.setTokens();
        if (this.tokensIsUndefined) await renewToken(3);
        if (this.tokensIsUndefined) return this.exit("Twitch Access Token not found");

        this.streamers = new Set(Array.from(this.data.keys()));
        this.streamersQueueCheck = Array.from(this.streamers);

        return checkAccessTokenAndStart();
    }

    get tokensIsUndefined() {
        return !this.TwitchAccessToken && !this.TwitchAccessTokenSecond && !this.TwitchAccessTokenThird;
    }

    async setTokens(): Promise<void> {
        const data = await Database.Client.findOne({ id: env.SAPHIRE_ID });
        this.TwitchAccessToken = data?.TwitchAccessToken;
        this.TwitchAccessTokenSecond = data?.TwitchAccessTokenSecond;
        this.TwitchAccessTokenThird = data?.TwitchAccessTokenThird;
        return;
    }

    async fetcher<T = unknown>(url: string): Promise<{ message: "string" } | any[] | undefined | T | any> {

        if (!url || this.tokensIsUndefined) return;

        this.requests++;
        return new Promise(resolve => {

            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                this.requests--;
                return resolve({ message: "Timed out" });
            }, 5000);

            const headers = this.randomHeadersAutorization;
            if (!headers?.Authorization) return resolve({ message: "No headers access token available, try again" });

            if (this.sleepAccessTokens.has(headers.Authorization!)) {
                this.requests--;
                return resolve({ message: "Try again" });
            }

            fetch(url, {
                method: "GET",
                headers: {
                    authorization: `Bearer ${headers.Authorization}`,
                    "Client-Id": headers["Client-Id"]
                }
            })
                .then(async res => {
                    if (timedOut) return;
                    clearTimeout(timeout);

                    const remaining = Number(res.headers.get("ratelimit-remaining"));

                    if (remaining < 50) {
                        this.sleepAccessTokens.add(headers.Authorization!);
                        setTimeout(() => this.sleepAccessTokens.delete(headers.Authorization!), 1000 * 30);
                    }

                    if (res.status === 429 || remaining < 40) {  // Rate limit exceeded
                        this.sleepAccessTokens.add(headers.Authorization!);
                        setTimeout(() => this.sleepAccessTokens.delete(headers.Authorization!), 1000 * 30);
                        this.requests--;
                        return resolve({ message: "TIMEOUT" });
                    }

                    if (res.status === 400) {
                        console.log(res.json().then(r => r), headers, url);
                        this.requests--;
                        return resolve({ message: "Status 400", res: await res.json() });
                    }

                    return res.json();
                })
                .then(async res => {

                    if (!res) return;

                    if (res.message === "Client ID and OAuth token do not match") {
                        await renewToken(this.accessTokenID(headers.Authorization!));
                        this.requests--;
                        return resolve({ message: "Client ID and OAuth token do not match" });
                    }

                    if (res.status === 401) { // Unauthorized                         
                        console.log("TWITCH BAD REQUEST - At Fetcher Function 2", res, url);
                        this.requests--;
                        return resolve({ message: "Twitch Bad Request", res, url });
                    }

                    if (res.message === "invalid access token") {
                        this.requests--;
                        resolve({ message: "invalid access token" });
                        await renewToken(this.accessTokenID(headers.Authorization!));
                        if (this.tokensIsUndefined) return this.exit("TwitchAccessToken missing");

                        return;
                    }

                    this.requests--;
                    if (url.includes("/followers")) return resolve(res.total);
                    return resolve(res.data || []);
                })
                .catch(err => {
                    clearTimeout(timeout);
                    this.requests--;
                    resolve({ message: "Error", err });

                    if (
                        [
                            "UND_ERR_CONNECT_TIMEOUT"
                        ].includes(err?.code || err?.data?.code)
                    )
                        return;

                    console.log("TWITCH MANAGER FETCH ERROR - At Fetcher Function 3", err, url);
                    return;
                });
        });
    }

    accessTokenID(accessToken: string) {
        return {
            [`${this.TwitchAccessToken}`]: 1,
            [`${this.TwitchAccessTokenSecond}`]: 2,
            [`${this.TwitchAccessTokenThird}`]: 3,
        }[accessToken] as 1 | 2 | 3;
    }

    async startCounter() {

        if (this.notificationInThisSeason > 0)
            await Database.Client.updateOne(
                { id: env.SAPHIRE_ID },
                { $inc: { TwitchNotifications: this.notificationInThisSeason } }
            );

        this.notificationInThisSeason = 0;
        setTimeout(() => this.startCounter(), 1000 * 30);
        return;
    }

    async checkStreamersStatus(): Promise<NodeJS.Timeout> {

        let streamers = this.streamersQueueCheck.splice(0, 100);

        if (!streamers.length) {
            this.streamersQueueCheck = Array.from(this.data.keys());
            streamers = this.streamersQueueCheck.splice(0, 100);
        }

        if (streamers?.length) {
            const streamersStreamStatus = await this.fetcher<StreamData[]>(`https://api.twitch.tv/helix/streams?${streamers.map(str => `user_login=${str}`).join("&")}`);
            if (!streamersStreamStatus?.message && Array.isArray(streamersStreamStatus)) {
                this.treatStreamersOffline(streamers.filter(streamer => !streamersStreamStatus.some(d => d.user_login === streamer)));
                this.treatStreamersOnline(streamersStreamStatus);
            }

        }

        return setTimeout(() => this.checkStreamersStatus(), 1000 * 5);
    }

    async treatStreamersOnline(streams: StreamData[]) {

        if (!streams?.length) return;

        const toFetchUncachedStreamers: string[] = [];

        for (const stream of streams) {
            const data = this.streamersOnline.get(stream.user_login);
            if (data) {
                stream.profile_image_url = data?.profile_image_url as string || undefined;
                stream.display_name = data?.display_name as string || undefined;
                this.streamersOnline.set(stream.user_login, stream);
                this.notifyAllChannels(stream);
                continue;
            }
            toFetchUncachedStreamers.push(stream.user_login);
        }

        if (toFetchUncachedStreamers.length) {
            const response = await this.getStreamersData(toFetchUncachedStreamers);
            if (!response?.length) return;

            for (const stream of streams) {
                const d = response.find(str => str.login === stream.user_login);
                if (!d) continue;

                stream.profile_image_url = d?.profile_image_url as string || undefined;
                stream.display_name = d?.display_name as string || undefined;
                this.streamersOnline.set(stream.user_login, stream);
                setTimeout(() => this.streamersOnline.delete(stream.user_login), 1000 * 60 * 30);
                this.notifyAllChannels(stream);
                continue;
            }
        }

        return;
    }

    async treatStreamersOffline(streamers: string[]) {
        if (!streamers?.length) return;

        const documents: TwitchSchema[] = await Database.Twitch.find({ streamer: { $in: streamers } });
        const notifierData: Record<string, { channelId: string, guildId: string }[]> = {};

        for await (const doc of documents) {
            this.streamersOnline.delete(doc.streamer!);

            if (!doc.streamer) {
                await Database.Twitch.findByIdAndDelete(doc._id);
                continue;
            }

            let notifiers: NotifierData[] = Object.values(doc.notifiers as NotifierData);
            notifiers = notifiers?.filter(d => d.notified);

            for await (const data of notifiers) {
                if (!this.guildsLocale.has(data.guildId)) {
                    this.guildsLocale.set(data.guildId, await this.getGuildLocale(data.guildId));
                }

                notifierData[doc.streamer]
                    ? notifierData[doc.streamer].push({ channelId: data.guildId, guildId: data.guildId })
                    : notifierData[doc.streamer] = [{ channelId: data.guildId, guildId: data.guildId }];
            }

        }

        for (const [streamer, _] of Object.entries(notifierData))
            this.refreshChannelNotified(streamer, Object.values(notifierData).map(d => d[0].channelId).flat(), false);

        this.notifyOfflineStreamersChannels(notifierData);
        return;
    }

    async refreshChannelNotified(streamer: string, channelsId: string[], notified: boolean) {
        if (!channelsId.length) return;

        const data: Record<string, boolean> = {};

        for (const channelId of channelsId)
            data[`notifiers.${channelId}.notified`] = notified;

        await Database.Twitch.findOneAndUpdate(
            { streamer },
            { $set: data },
            { new: true, upsert: true }
        )
            .then(document => {
                const doc = document?.toObject();
                if (doc?.streamer) this.data.set(doc?.streamer, doc?.notifiers);
            })
            .catch(console.log);

        return;
    }

    async getStreamersData(streamers: string[]) {

        const streamersData: UserData[] = [];
        const toFetchUncachedStreamer: string[] = [];

        for (const streamer of streamers) {
            const data = this.streamersData.get(streamer);
            data
                ? streamersData.push(data)
                : toFetchUncachedStreamer.push(streamer);
        }

        if (!toFetchUncachedStreamer?.length) return [];

        const response = await this.fetcher<UserData[]>(`https://api.twitch.tv/helix/users?${toFetchUncachedStreamer.filter(Boolean).slice(0, 100).map(str => `login=${str}`).join("&")}`);
        if (response?.message || !response?.length) return [];

        for (const data of response) {
            this.streamersData.set(data.login, data);
            setTimeout(() => this.streamersData.delete(data.login), 1000 * 60 * 30);
            streamersData.push(data);
        }

        return streamersData;
    }

    async notifyOfflineStreamersChannels(offlineStreamers: Record<string, { channelId: string, guildId: string }[]>) {

        const data = Object.entries(offlineStreamers);
        if (!data?.length) return;

        const streamers = data.map(([streamer]) => streamer);
        const response = await this.getStreamersData(streamers);
        if (!response?.length) return;

        for await (const [streamer, channels] of data) {

            const data = response.find(d => d.login === streamer);
            if (!data) continue;
            this.streamersData.set(data.login, data);
            setTimeout(() => this.streamersData.delete(data.login), 1000 * 60 * 30);

            const offlineImage = data?.offline_image_url || null;

            for await (const { channelId, guildId } of channels) {
                if (this.channelsToIgnore.has(channelId)) continue;
                this.tempChannelsNotified.delete(`${streamer}.${channelId}`);

                if (this.retryAfter.has(`${streamer}.${channelId}`)) {
                    const time = this.retryAfter.get(`${streamer}.${channelId}`) || 0;
                    if (time > Date.now()) return;
                    this.retryAfter.delete(`${streamer}.${channelId}`);
                }

                const locale = await this.getGuildLocale(guildId);

                await rest.post(
                    Routes.channelMessages(channelId),
                    {
                        body: {
                            content: offlineImage ? null : t("no_longer_online", { e, streamer, locale }),
                            embeds: offlineImage
                                ? [{
                                    color: 0x9c44fb, /* Twitch's Logo Purple */
                                    author: {
                                        name: t("no_longer_online", { e, streamer: data.display_name || streamer, locale }),
                                        icon_url: data.profile_image_url as string,
                                        url: `https://www.twitch.tv/${streamer}`
                                    },
                                    image: { url: offlineImage },
                                    footer: {
                                        text: t("saphire_moon_twitch_notification", locale),
                                        icon_url: "https://freelogopng.com/images/all_img/1656152623twitch-logo-round.png",
                                    }
                                }]
                                : [],
                            components: <any[]>[{
                                type: 1,
                                components: [{
                                    type: 2,
                                    label: t("more_lives", { locale, streamer }).slice(0, 80),
                                    emoji: parseEmoji("🎬"),
                                    custom_id: JSON.stringify({ c: "twitch", src: "oldLive", streamerId: data.id }),
                                    style: ButtonStyle.Primary
                                }]
                            }]
                        }
                    }
                )
                    .catch(err => this.errorToPostMessage(err, streamer, channelId, undefined, data));
            }

        }
        return;
    }

    async notifyAllChannels(stream: StreamData) {
        if (!stream) return;
        const streamer = stream?.user_login;

        const document = await Database.Twitch.findOne({ streamer });
        if (!document) return;

        const channelsData = Object.values(document.notifiers || {}) as NotifierData[];
        if (!channelsData?.length) return;

        const avatar = stream.profile_image_url;
        const viewers = `\`${this.num(stream.viewer_count || 0)}\``;
        const imageUrl = stream.thumbnail_url?.replace("{width}x{height}", "620x378") || null;
        const url = `https://www.twitch.tv/${streamer}`;
        const date = new Date(stream.started_at);
        const dataToSet: Record<string, boolean> = {};

        for await (const data of channelsData) {
            if (this.channelsToIgnore.has(data.channelId)) continue;

            if (this.retryAfter.has(`${streamer}.${data.channelId}`)) {
                const time = this.retryAfter.get(`${streamer}.${data.channelId}`) || 0;
                if (time > Date.now()) return;
                this.retryAfter.delete(`${streamer}.${data.channelId}`);
            }

            if (data.notified) {
                this.tempChannelsNotified.add(`${streamer}.${data.channelId}`);
                continue;
            }

            if (this.tempChannelsNotified.has(`${streamer}.${data.channelId}`)) continue;
            this.tempChannelsNotified.add(`${streamer}.${data.channelId}`);
            this.notificationInThisSeason++;
            this.notificationsCount++;

            const locale = await this.getGuildLocale(data.guildId);
            const messageDefault = t("is_live", { stream, locale });
            const game = stream.game_name ? `${stream.game_name} \`${stream.game_id}\`` : t("game_undefined", locale);
            const roleMention = data.roleId ? data.roleId === data.guildId || data.roleId === "@everyone" ? "@everyone " : data.roleId === "@here" ? "@here " : data.roleId ? `<@&${data.roleId}>, ` : "" : "";
            const content = `${e.Notification} ${roleMention}${data.message ? data.message.replace("$streamer", streamer).replace("$role", roleMention) : messageDefault}`;

            await rest.post(
                Routes.channelMessages(data.channelId),
                {
                    body: {
                        content,
                        embeds: [{
                            color: 0x9C44FB, // Twitch's Logo Purple
                            title: stream.title?.slice(0, 256) || t("no_title_defined", locale),
                            author: {
                                name: stream.user_name || "??",
                                icon_url: avatar,
                                url
                            },
                            url,
                            thumbnail: { url: avatar as string },
                            description: t("streaming", { game, viewers, locale }),
                            fields: [
                                {
                                    name: t("adicional", locale),
                                    value: t("adicional_data", {
                                        locale,
                                        online_data: time(date, "R"),
                                        iniciated: this.datecomplete(stream.started_at),
                                        tags: stream.tags?.map((tag: string) => `\`${tag}\``)?.join(", ") || t("no_tag", locale),
                                        mature: stream.is_mature ? t("yes", locale) : t("no", locale),
                                        languages: this.getTwitchLanguages(stream.language)
                                    })
                                }
                            ],
                            image: { url: imageUrl as string },
                            footer: {
                                text: t("saphire_moon_twitch_notification", locale),
                                icon_url: "https://freelogopng.com/images/all_img/1656152623twitch-logo-round.png"
                            }
                        }],
                        components: [{
                            type: 1,
                            components: [{
                                type: 2,
                                label: t("drop_clips", locale),
                                emoji: parseEmoji("🔒"),
                                custom_id: JSON.stringify({ c: "twitch", src: "clips", streamerId: stream.user_id }),
                                style: ButtonStyle.Primary
                            }]
                        }]
                    }
                }
            )
                .then(() => dataToSet[`notifiers.${data.channelId}.notified`] = true)
                .catch(err => this.errorToPostMessage(err, streamer, data.channelId, data.guildId, data));
            continue;
        }

        if (!Object.keys(dataToSet)?.length) return;
        const refreshData = await Database.Twitch.findOneAndUpdate(
            { streamer },
            { $set: dataToSet },
            { new: true, upsert: true }
        );

        this.data.set(refreshData.streamer!, refreshData.notifiers);
        return;
    }

    async getGuildLocale(guildId: string) {
        let locale = this.guildsLocale.get(guildId);

        if (!locale) {
            const guildData = await rest.get(Routes.guild(guildId)).catch(() => { }) as APIGuild;
            locale = guildData?.preferred_locale || "en-US";
            this.guildsLocale.set(guildId, locale);
        }

        return locale;
    }

    async errorToPostMessage(err: DiscordAPIError | any, streamer: string, channelId: string, guildId: string | undefined, data: NotifierData | UserData | null) {

        if (!channelId)
            return await this.removeChannel(streamer, channelId);

        if (!err) return;
        this.tempChannelsNotified.delete(`${streamer}.${channelId}`);

        // Unknown Guild
        if (err.code === 10004)
            return await this.removeAllNotifiersFromThisGuild(guildId!);

        // Unknown Channel
        if (err.code === 10003)
            return await this.removeAllChannelsFromDatabase(channelId);

        // Missing Access
        if (err.code === 50001) {
            this.retryAfter.set(`${streamer}.${channelId}`, Date.now() + (1000 * 60));
            this.tempChannelsNotified.delete(`${streamer}.${channelId}`);
            return;
        }

        return console.log(err, data);
    }

    async removeAllNotifiersFromThisGuild(guildId: string) {
        if (!guildId) return;

        const notifiers = this.getAllNotifersFromThisGuild(guildId);
        if (!notifiers?.length) return;

        const unset: Record<string, boolean> = {};

        for (const data of notifiers)
            unset[`notifiers.${data.channelId}`] = true;

        await Database.Twitch.updateMany({}, { $unset: { unset } });
        return await this.refreshAllData();
    }

    async removeAllChannelsFromDatabase(channelId: string) {
        this.channelsToIgnore.add(channelId);
        await Database.Twitch.updateMany({}, { $unset: { [`notifiers.${channelId}`]: true } });
        return await this.refreshAllData();
    }

    async removeChannel(streamer: string, channelId: string) {
        const data = await Database.Twitch.findOneAndUpdate(
            { streamer },
            { $unset: { [`notifiers.${channelId}`]: true } },
            { new: true, upsert: true }
        );

        this.data.set(streamer, data.notifiers);
        return;
    }

    async refreshAllData() {
        const data = await Database.Twitch.find();
        for await (const d of data) {
            if (!d.streamer || !d.notifiers) {
                await Database.Twitch.findByIdAndDelete(d._id);
                continue;
            }
            this.data.set(d.streamer, d.notifiers);
        }

        return true;
    }

    getAllNotifersFromThisGuild(guildId: string) {
        return this.data
            .filter(v => Object.values(v || {})?.[0]?.guildId === guildId)
            .map((notifier, streamer) => {
                const data = Object.values(notifier);
                data[0].streamer = streamer;
                return data;
            })
            .flat();
    }

    num(num: number): string {
        const numberFormated = `${Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(num)}`;
        return `${numberFormated.slice(3)}`.slice(0, -3);
    }

    datecomplete(ms: number | string): string {
        return `${time(new Date(ms), "D")} às ${time(new Date(ms), "T")}`;
    }

    getTwitchLanguages(str: string | undefined) {
        return TwitchLanguages[str as keyof typeof TwitchLanguages] || "Indefinido";
    }

    get randomHeadersAutorization() {
        const headers = [
            {
                Authorization: this.TwitchAccessToken,
                "Client-Id": `${env.TWITCH_CLIENT_ID}`
            },
            {
                Authorization: this.TwitchAccessTokenSecond,
                "Client-Id": `${env.TWITCH_CLIENT_ID_SECOND}`
            },
            {
                Authorization: this.TwitchAccessTokenThird,
                "Client-Id": `${env.TWITCH_CLIENT_ID_THIRD}`
            }
        ]
            .filter(h => !this.sleepAccessTokens.has(h.Authorization!) && (this.lastAccessToken !== h.Authorization!));

        const result = headers[Math.floor(Math.random() * headers.length)];
        if (!result?.Authorization) return;

        this.lastAccessToken = result.Authorization!;
        return result;
    }

    exit(message: string) {
        console.log(message);
        return process.exit();
    }
};