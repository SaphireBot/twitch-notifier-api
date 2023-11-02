import { env } from "process";
import { FetchError, OauthToken, OauthValidade } from "../@types/twitch";
import TwitchManager from "./index";
import Database from "../database";

export async function renewToken(num: 0 | 1 | 2 | 3 | undefined): Promise<string | undefined | void> {
    if (typeof num !== "number") return;

    // https://dev.twitch.tv/docs/api/get-started/
    if ([0, 3].includes(num)) await renew(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET, "TwitchAccessToken");
    if ([1, 3].includes(num)) await renew(env.TWITCH_CLIENT_ID_SECOND, env.TWITCH_CLIENT_SECRET_SECOND, "TwitchAccessTokenSecond");
    if ([2, 3].includes(num)) await renew(env.TWITCH_CLIENT_ID_THIRD, env.TWITCH_CLIENT_SECRET_THIRD, "TwitchAccessTokenThird");

    return;
}

async function validate(accessToken: string, renewTokenNumberControl: 0 | 1 | 2 | 3) {
    if (!accessToken) return;

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
                await renewToken(renewTokenNumberControl);
                if (!TwitchManager.TwitchAccessToken) return TwitchManager.exit("Twitch Access Token not found");
            }
        })
        .catch(err => {
            console.log(err);
            return TwitchManager.exit("Function checkAccessTokenAndStartLoading");
        });
}

async function renew(TWITCH_CLIENT_ID: string, TWITCH_CLIENT_SECRET: string, key: "TwitchAccessToken" | "TwitchAccessTokenSecond" | "TwitchAccessTokenThird") {

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
    validate(TwitchManager.TwitchAccessToken!, 0);
    validate(TwitchManager.TwitchAccessTokenSecond!, 1);
    validate(TwitchManager.TwitchAccessTokenThird!, 2);

    TwitchManager.startCounter();
    TwitchManager.checkStreamersStatus();
    return;
}