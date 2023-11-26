import { env } from "process";
import { AccessTokensName, FetchError, OauthToken, OauthValidade } from "../@types/twitch";
import TwitchManager from "./index";
import Database from "../database";
const tokens = {
    TwitchAccessToken: {
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET
    },
    TwitchAccessTokenSecond: {
        client_id: env.TWITCH_CLIENT_ID_SECOND,
        client_secret: env.TWITCH_CLIENT_SECRET_SECOND
    },
    TwitchAccessTokenThird: {
        client_id: env.TWITCH_CLIENT_ID_THIRD,
        client_secret: env.TWITCH_CLIENT_SECRET_THIRD
    },
    TwitchAccessTokenFourth: {
        client_id: env.TWITCH_CLIENT_ID_FOURTH,
        client_secret: env.TWITCH_CLIENT_SECRET_FOURTH
    }
};

export async function renewToken(tokenKey?: AccessTokensName | "all"): Promise<void> {
    if (!tokenKey) return;

    if (tokenKey === "all") {
        for await (const [tokenName, { client_id, client_secret }] of Object.entries(tokens))
            await renew(client_id, client_secret, tokenName as any);
        return;
    }

    const token = tokens[tokenKey];
    if (!token) return;

    // https://dev.twitch.tv/docs/api/get-started/
    await renew(token.client_id, token.client_secret, tokenKey);

    return;
}

async function validate(accessToken: string, tokenKey: AccessTokensName) {
    if (!accessToken || !tokenKey) return;

    // https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
    await fetch(
        "https://id.twitch.tv/oauth2/validate",
        {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        }
    )
        .then(res => res.json())
        .then(async (data: OauthValidade | FetchError) => {
            if (
                ("status" in data && "message" in data)
                || ("expires_in" in data && data.expires_in < 86400)
            ) {
                await renewToken(tokenKey);
                if (!TwitchManager.tokensIsUndefined) return TwitchManager.exit("Any Twitch Access Token found");
            }
            return;
        })
        .catch(err => {
            console.log(err);
            return TwitchManager.exit("Function checkAccessTokenAndStartLoading");
        });

    return;
}

async function renew(TWITCH_CLIENT_ID: string, TWITCH_CLIENT_SECRET: string, key: AccessTokensName) {

    await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        }
    )
        .then(res => res.json())
        .then(async (data: OauthToken | FetchError) => {
            console.log("TOKEN RENEWED", data);

            if ("status" in data)
                return console.log("Fail to validate the token", data);

            TwitchManager[key] = data.access_token;
            return await Database.Client.updateOne(
                { id: env.SAPHIRE_ID },
                { $set: { [key]: data.access_token } },
                { upsert: true }
            )
                .then(() => data.access_token)
                .catch(err => console.log("Function renewToken", err));
        })
        .catch(err => console.log("Function renewToken", err));
}

export async function checkAccessTokenAndStart() {

    // https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
    for await (const token of Object.keys(tokens))
        await validate(TwitchManager[token as AccessTokensName]!, token as AccessTokensName);

    await TwitchManager.startCounter();
    await TwitchManager.checkStreamersStatus();
    return;
}