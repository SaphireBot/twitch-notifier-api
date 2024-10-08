import { discloud } from "discloud.app";
import { env } from "process";

discloud.rest.setToken(env.DISCLOUD_TOKEN);