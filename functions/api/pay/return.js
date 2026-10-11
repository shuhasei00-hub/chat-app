// 決済ページ(fincode)からの戻り口。fincode は success_url / cancel_url に「POST」でリダイレクトするため、
// POST も GET も受けて、アプリのトップ(/?pay=return&ref=...)へ 303 で戻す。
import { appOrigin } from "../../_lib/util.js";

const back = ({ env, request }) => {
  const u = new URL(request.url);
  const ref = /^[a-f0-9]{32}$/.test(u.searchParams.get("ref") || "") ? u.searchParams.get("ref") : "";
  const kind = u.searchParams.get("r") === "cancel" ? "cancel" : "return";
  return new Response(null, { status: 303, headers: { location: `${appOrigin(env, request)}/?pay=${kind}${ref ? `&ref=${ref}` : ""}`, "cache-control": "no-store" } });
};
export const onRequestPost = back;
export const onRequestGet = back;
