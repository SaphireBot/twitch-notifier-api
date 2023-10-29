import { env } from "process";
import Database from "../database";
import { ButtonStyle, Collection, REST, Routes, parseEmoji, time } from "discord.js";
import { TwitchLanguages, emojis as e } from "../data.json";
import {
    FetchError,
    OauthToken,
    OauthValidade,
    StreamData,
    NotifierData,
    UserData,
} from "../@types/twitch";
import { TwitchSchema } from "../database/twitch_model";

const rest = new REST().setToken(env.DISCORD_TOKEN);

export default new class TwitchManager {
    declare streamers: Set<string>;
    declare data: Collection<string, Record<string, NotifierData>>;
    declare TwitchAccessToken: string | undefined | void;
    declare streamersOnline: Map<string, StreamData>;
    declare streamersData: Map<string, UserData>;
    declare notificationInThisSeason: number;
    declare streamersQueueCheck: string[];
    rateLimit: {
        MaxLimit: number
        remaining: number
        inCheck: boolean,
    };

    constructor() {
        this.streamers = new Set();
        this.streamersOnline = new Map();
        this.streamersData = new Map();
        this.data = new Collection();
        this.TwitchAccessToken = undefined;
        this.notificationInThisSeason = 0;
        this.streamersQueueCheck = [];
        this.rateLimit = {
            MaxLimit: 800,
            remaining: 800,
            inCheck: false,
        };
    }

    async load(): Promise<any> {
        this.TwitchAccessToken = await this.getToken();
        if (!this.TwitchAccessToken) this.TwitchAccessToken = await this.renewToken();
        if (!this.TwitchAccessToken) return this.exit("Twitch Access Token not found");

        this.streamers = new Set(Array.from(this.data.keys()));
        this.streamersQueueCheck = Array.from(this.streamers);

        return this.checkAccessTokenAndStart();
    }

    async getToken(): Promise<string | undefined> {
        return await Database.Client.findOne({ id: env.SAPHIRE_ID }).then(doc => doc?.TwitchAccessToken).catch(() => undefined);
    }

    async renewToken(): Promise<string | undefined | void> {
        // https://dev.twitch.tv/docs/api/get-started/
        return await fetch(
            `https://id.twitch.tv/oauth2/token?client_id=${env.TWITCH_CLIENT_ID}&client_secret=${env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            }
        )
            .then(res => res.json())
            .then(async (data: OauthToken | FetchError) => {

                if ("status" in data)
                    return console.log("Fail to validate the token");

                return await Database.Client.updateOne(
                    { id: env.SAPHIRE_ID },
                    { $set: { TwitchAccessToken: data.access_token } }
                )
                    .then(() => data.access_token)
                    .catch(err => console.log("Function renewToken", err));
            })
            .catch(err => console.log("Function renewToken", err));
    }

    exit(message: string) {
        console.log(message);
        return process.exit();
    }

    async checkAccessTokenAndStart() {

        // https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
        return await fetch(
            "https://id.twitch.tv/oauth2/validate",
            {
                method: "GET",
                headers: { Authorization: `OAuth ${this.TwitchAccessToken}` }
            }
        )
            .then(res => res.json())
            .then(async (data: OauthValidade | FetchError) => {
                if (
                    ("status" in data && "message" in data)
                    || ("expires_in" in data && data.expires_in < 86400)
                ) {
                    this.TwitchAccessToken = await this.renewToken();
                    if (!this.TwitchAccessToken) return this.exit("Twitch Access Token not found");
                }

                this.startCounter();
                this.checkStreamersStatus();
                return;
            })
            .catch(err => {
                console.log(err);
                return this.exit("Function checkAccessTokenAndStartLoading");
            });

    }

    async fetcher<T = unknown>(url: string): Promise<"TIMEOUT" | [] | undefined | T> {

        if (!url || !this.TwitchAccessToken) return;

        return new Promise(resolve => {

            if (this.rateLimit.inCheck) return resolve("TIMEOUT");

            this.rateLimit.remaining--;
            if (
                this.rateLimit.inCheck
                || this.rateLimit.remaining < 70
            ) {
                this.checkRatelimit(this.rateLimit.remaining);
                return resolve("TIMEOUT");
            }

            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                return resolve([]);
            }, 2000);

            fetch(url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.TwitchAccessToken}`,
                    "Client-Id": `${env.TWITCH_CLIENT_ID}`
                }
            })
                .then(res => {
                    if (timedOut) return;
                    clearTimeout(timeout);

                    if (res.status === 429 || this.rateLimit.inCheck) // Rate limit exceeded
                        return resolve("TIMEOUT");

                    this.rateLimit.MaxLimit = Number(res.headers.get("ratelimit-limit"));
                    const remaining = Number(res.headers.get("ratelimit-remaining"));

                    if (remaining >= 70)
                        this.rateLimit.remaining = Number(res.headers.get("ratelimit-remaining"));

                    if (this.rateLimit.remaining < 70)
                        this.checkRatelimit(this.rateLimit.remaining);

                    if (res.status === 400) return resolve([]);

                    return res.json();
                })
                .then(async res => {

                    if (!res) return;

                    if (res.status === 401) { // Unauthorized                         
                        console.log("TWITCH BAD REQUEST - At Fetcher Function 2", res, url);
                        return resolve([]);
                    }

                    if (res.message === "invalid access token") {
                        this.rateLimit.inCheck = true;

                        this.TwitchAccessToken = await this.renewToken();
                        if (!this.TwitchAccessToken) {
                            resolve("TIMEOUT");
                            return this.exit("TwitchAccessToken missing");
                        }

                        return resolve([]);
                    }

                    if (url.includes("/followers")) return resolve(res.total);
                    return resolve(res.data || []);
                })
                .catch(err => {
                    clearTimeout(timeout);
                    resolve([]);

                    if (
                        [
                            "UND_ERR_CONNECT_TIMEOUT"
                        ].includes(err?.code || err?.data?.code)
                    )
                        return;

                    console.log("TWITCH MANAGER FETCH ERROR - At Fetcher Function 3", err, url);
                    return resolve([]);
                });
        });
    }

    async checkRatelimit(remaining: number) {

        if (remaining > 780) {
            this.rateLimit.inCheck = false;
            return;
        }

        if (this.rateLimit.inCheck) return;
        this.rateLimit.inCheck = true;

        const check = await this.check();
        if (check) return;

        const interval = setInterval(async () => {
            const check = await this.check();
            if (check) {
                this.rateLimit.inCheck = false;
                clearInterval(interval);
                return;
            }
        }, 1000 * 5);
        return;
    }

    async check(): Promise<boolean> {

        return await fetch("https://api.twitch.tv/helix/users?login=alanzoka", { // Top One of Brazil
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.TwitchAccessToken}`,
                "Client-Id": `${env.TWITCH_CLIENT_ID}`
            }
        })
            .then(res => {
                this.rateLimit.remaining = Number(res.headers.get("ratelimit-remaining"));
                console.log("CHECKING - Check Rate Limit Function", this.rateLimit.remaining);
                if (this.rateLimit.remaining > (this.rateLimit.MaxLimit - 20))
                    this.rateLimit.inCheck = false;

                return this.rateLimit.remaining > (this.rateLimit.MaxLimit - 20);
            })
            .catch(err => {

                if (
                    [
                        "UND_ERR_CONNECT_TIMEOUT"
                    ].includes(err?.code)
                )
                    return false;

                console.log("TWITCH MANAGER FETCH ERROR - Check Rate Limit Function", err);
                return false;
            });
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

        let streamers = this.streamersQueueCheck.slice(0, 100);

        if (!streamers.length) {
            this.streamersQueueCheck = Array.from(this.data.keys());
            streamers = this.streamersQueueCheck.slice(0, 100);
        }

        if (streamers?.length) {
            const streamersStreamStatus = await this.fetcher<StreamData[]>(`https://api.twitch.tv/helix/streams?${streamers.map(str => `user_login=${str}`).join("&")}`);

            if (streamersStreamStatus !== "TIMEOUT" && Array.isArray(streamersStreamStatus)) {
                this.treatStreamersOffline(streamers.filter(streamer => !streamersStreamStatus.some(d => d.user_login === streamer)));
                this.treatStreamersOnline(streamersStreamStatus);
            }

            streamers.splice(0, streamers.length);
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
        const notifierData: Record<string, string[]> = {};

        for await (const doc of documents) {
            this.streamersOnline.delete(doc.streamer!);

            if (!doc.streamer) {
                await Database.Twitch.findByIdAndDelete(doc._id);
                continue;
            }

            let notifiers: NotifierData[] = Object.values(doc.notifiers as NotifierData);
            notifiers = notifiers?.filter(d => d.notified);

            for (const data of notifiers) {
                notifierData[doc.streamer]
                    ? notifierData[doc.streamer].push(data.channelId)
                    : notifierData[doc.streamer] = [data.channelId];
            }

        }

        for (const [streamer, channelsId] of Object.entries(notifierData))
            this.refreshChannelNotified(streamer, channelsId, false);

        this.notifyOfflineStreamersChannels(notifierData);
        return;
    }

    async refreshChannelNotified(streamer: string, channelsId: string[], notified: boolean) {
        if (!channelsId.length) return;

        const dataToSet = channelsId.map(str => ({ [`notifiers.${str}.notified`]: notified }));

        return await Database.Twitch.findOneAndUpdate(
            { streamer },
            { $set: dataToSet },
            { new: true, upsert: true }
        )
            .then(document => {
                const doc = document?.toObject();
                if (doc?.streamer) this.data.set(doc?.streamer, doc?.notifiers);
            })
            .catch(console.log);
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

        const response = await this.fetcher<UserData[]>(`https://api.twitch.tv/helix/users?${toFetchUncachedStreamer.filter(Boolean).slice(0, 100).map(str => `login=${str}`).join("&")}`);
        if (response === "TIMEOUT" || !response?.length) return [];

        for (const data of response) {
            this.streamersData.set(data.login, data);
            setTimeout(() => this.streamersData.delete(data.login), 1000 * 60 * 30);
            streamersData.push(data);
        }

        return streamersData;
    }

    async notifyOfflineStreamersChannels(offlineStreamers: Record<string, string[]>) {

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

            for await (const channelId of channels)
                await rest.post(
                    Routes.channelMessages(channelId),
                    {
                        body: {
                            content: offlineImage ? null : `<a:bell:1066521641422700595> | **${streamer}** não está mais online.`,
                            embeds: offlineImage
                                ? [{
                                    color: 0x9c44fb, /* Twitch's Logo Purple */
                                    author: {
                                        name: `${data.display_name || streamer} não está mais online.`,
                                        icon_url: data.profile_image_url as string,
                                        url: `https://www.twitch.tv/${streamer}`
                                    },
                                    image: { url: offlineImage },
                                    footer: {
                                        text: "Saphire Moon's Twitch Notification System [API]",
                                        icon_url: "https://freelogopng.com/images/all_img/1656152623twitch-logo-round.png",
                                    }
                                }]
                                : [],
                            components: <any[]>[{
                                type: 1,
                                components: [{
                                    type: 2,
                                    label: `Mais lives de ${streamer}`.slice(0, 80),
                                    emoji: parseEmoji("🎬"),
                                    custom_id: JSON.stringify({ c: "twitch", src: "oldLive", streamerId: data.id }),
                                    style: ButtonStyle.Primary
                                }]
                            }]
                        }
                    }
                )
                    .catch(console.log);

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

        const game = stream.game_name ? `${stream.game_name} \`${stream.game_id}\`` : "Nenhum jogo foi definido";
        const avatar = stream.profile_image_url;
        const viewers = `\`${this.num(stream.viewer_count || 0)}\``;
        const imageUrl = stream.thumbnail_url?.replace("{width}x{height}", "620x378") || null;
        const url = `https://www.twitch.tv/${streamer}`;
        const messageDefault = `**${stream.display_name}** está em live na Twitch.`;
        const date = new Date(stream.started_at);
        const alreadySended = <string[]>[];
        const notifiersData: Record<string, NotifierData> = document.notifiers;

        const notifier = async (data: NotifierData) => {

            const roleMention = data.roleId ? `<@&${data.roleId}>, ` : "";
            const content = `${e.Notification} ` + roleMention + data.message ? data.message : messageDefault;

            await rest.post(
                Routes.channelMessages(data.channelId),
                {
                    body: {
                        content,
                        embeds: [{
                            color: 0x9C44FB, // Twitch's Logo Purple
                            title: stream.title?.slice(0, 256) || "Nenhum título foi definido",
                            author: {
                                name: stream.user_name || "??",
                                icon_url: avatar,
                                url
                            },
                            url,
                            thumbnail: { url: avatar as string },
                            description: `📺 Transmitindo **${game}**\n👥 ${viewers} pessoas assistindo agora`,
                            fields: [
                                {
                                    name: "📝 Adicional",
                                    value: `⏳ Está online ${time(date, "R")}\n🗓️ Iniciou a live: ${this.datecomplete(stream.started_at)}\n⏱️ Demorei \`${this.stringDate(Date.now() - date?.valueOf())}\` para enviar esta notificação\n🏷️ Tags: ${stream.tags?.map((tag: string) => `\`${tag}\``)?.join(", ") || "Nenhuma tag"}\n🔞 +18: ${stream.is_mature ? "Sim" : "Não"}\n💬 Idioma: ${this.getTwitchLanguages(stream.language)}`
                                }
                            ],
                            image: { url: imageUrl as string },
                            footer: {
                                text: "Saphire Moon's Twitch Notification System [API]",
                                icon_url: "https://freelogopng.com/images/all_img/1656152623twitch-logo-round.png"
                            }
                        }],
                        components: [{
                            type: 1,
                            components: [{
                                type: 2,
                                label: "Liberar Clips",
                                emoji: parseEmoji("🔒"),
                                custom_id: JSON.stringify({ c: "twitch", src: "clips", streamerId: stream.user_id }),
                                style: ButtonStyle.Primary
                            }]
                        }]
                    }
                }
            )
                .then(() => {
                    data.notified = true;
                    notifiersData[data.channelId] = data;
                })
                .catch(() => {
                    delete notifiersData[data.channelId];
                });
        };

        for (let i = 0; i < channelsData.length; i++) {
            const data = channelsData[i];
            if (alreadySended.includes(data.channelId) || data.notified) continue;
            alreadySended.push(data.channelId);

            this.notificationInThisSeason++;

            notifier(data);
            continue;
        }

        const documentRefresh = await Database.Twitch.findOneAndUpdate({ streamer }, { $set: notifiersData }, { new: true, upsert: true });
        this.data.set(documentRefresh.streamer!, documentRefresh.notifiers);
        return;
    }

    num(num: number): string {
        const numberFormated = `${Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(num)}`;
        return `${numberFormated.slice(3)}`.slice(0, -3);
    }

    stringDate(ms: number) {

        if (!ms || isNaN(ms) || ms <= 0) return "0 segundo";

        const totalYears = ms / (365.25 * 24 * 60 * 60 * 1000);
        const date: Record<string, number> = {
            millennia: Math.trunc(totalYears / 1000),
            century: Math.trunc((totalYears % 1000) / 100),
            years: Math.trunc(totalYears % 100),
            months: 0,
            days: Math.trunc(ms / 86400000),
            hours: Math.trunc(ms / 3600000) % 24,
            minutes: Math.trunc(ms / 60000) % 60,
            seconds: Math.trunc(ms / 1000) % 60
        };

        if (date.days >= 30)
            while (date.days >= 30) {
                date.months++;
                date.days -= 30;
            }

        const timeSequency = ["millennia", "century", "years", "months", "days", "hours", "minutes", "seconds"];
        let result = "";

        const translate: Record<string, (n: number) => string> = {
            millennia: (n: number) => n === 1 ? "milênio" : "milênios",
            century: (n: number) => n === 1 ? "século" : "séculos",
            years: (n: number) => n === 1 ? "ano" : "anos",
            months: (n: number) => n === 1 ? "mês" : "meses",
            days: (n: number) => n === 1 ? "dia" : "dias",
            hours: (n: number) => n === 1 ? "hora" : "horas",
            minutes: (n: number) => n === 1 ? "minuto" : "minutos",
            seconds: (n: number) => n === 1 ? "segundo" : "segundos"
        };

        for (const time of timeSequency)
            if (date[time] > 0)
                result += `${date[time]} ${translate[time](date[time])} `;

        return result?.trim();
    }

    datecomplete(ms: number | string): string {
        return `${time(new Date(ms), "D")} às ${time(new Date(ms), "T")}`;
    }

    getTwitchLanguages(str: string | undefined) {
        return TwitchLanguages[str as keyof typeof TwitchLanguages] || "Indefinido";
    }
};