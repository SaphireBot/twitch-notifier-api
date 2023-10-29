declare namespace NodeJS {
    interface ProcessEnv {
        SERVER_PORT: string
        WEBSOCKET_CONNECTION_AUTHORIZATION: string
        WEBSOCKET_URL: string
        DISCORD_TOKEN: string
        DATABASE_LINK_CONNECTION: string
        SAPHIRE_ID: string
        CANARY_ID: string
        MACHINE: string
        TWITCH_CLIENT_ID: string
        TWITCH_CLIENT_SECRET: string
    }
}