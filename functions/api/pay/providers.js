import { listProviders } from "../../_lib/providers/index.js";
import { PACKS } from "../../_lib/packs.js";
import { json } from "../../_lib/util.js";

export const onRequestGet = ({ env }) => json({ providers: listProviders(env), packs: PACKS });
