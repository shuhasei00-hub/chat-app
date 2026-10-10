// 天気（Open-Meteo: APIキー不要）
import React, { useCallback, useEffect, useState } from "react";
import { Search, MapPin, Droplets, Wind, Thermometer } from "lucide-react";
import { PageHeader, Spinner } from "./common";

const DEFAULT_CITY = { name: "東京", lat: 35.6895, lon: 139.6917 };
const LS_KEY = "weatherCity";

const WMO = (code) => {
  if (code === 0) return ["快晴", "☀️"];
  if (code === 1) return ["晴れ", "🌤️"];
  if (code === 2) return ["薄曇り", "⛅"];
  if (code === 3) return ["曇り", "☁️"];
  if (code === 45 || code === 48) return ["霧", "🌫️"];
  if (code >= 51 && code <= 57) return ["霧雨", "🌦️"];
  if (code >= 61 && code <= 67) return ["雨", "🌧️"];
  if (code >= 71 && code <= 77) return ["雪", "❄️"];
  if (code >= 80 && code <= 82) return ["にわか雨", "🌦️"];
  if (code === 85 || code === 86) return ["にわか雪", "🌨️"];
  if (code >= 95) return ["雷雨", "⛈️"];
  return ["--", "❔"];
};
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const loadCity = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || DEFAULT_CITY; } catch { return DEFAULT_CITY; }
};

const WeatherView = ({ setView, showNotification }) => {
  const [city, setCity] = useState(loadCity);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  const fetchWeather = useCallback(async (c) => {
    setLoading(true);
    setError(false);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("http");
      setData(await res.json());
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWeather(city); }, [city, fetchWeather]);

  const choose = (c) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* noop */ }
    setCity(c);
    setResults([]);
    setQ("");
  };

  const search = async () => {
    if (!q.trim()) return;
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=ja&format=json`);
      const json = await res.json();
      setResults((json.results || []).map((r) => ({ name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(" / "), lat: r.latitude, lon: r.longitude })));
      if (!json.results?.length) showNotification?.("見つかりませんでした");
    } catch (e) {
      showNotification?.("検索に失敗しました");
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return showNotification?.("位置情報が使えません");
    navigator.geolocation.getCurrentPosition(
      (p) => choose({ name: "現在地", lat: p.coords.latitude, lon: p.coords.longitude }),
      () => showNotification?.("位置情報を取得できませんでした"),
      { timeout: 8000 }
    );
  };

  const cur = data?.current;
  const hourly = (() => {
    if (!data?.hourly) return [];
    const start = Math.max(0, data.hourly.time.findIndex((t) => t >= (cur?.time || "").slice(0, 13)));
    return data.hourly.time.slice(start, start + 24).map((t, i) => ({
      hour: t.slice(11, 13) + "時",
      temp: Math.round(data.hourly.temperature_2m[start + i]),
      code: data.hourly.weather_code[start + i],
      pop: data.hourly.precipitation_probability[start + i],
    }));
  })();

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-sky-100 to-white">
      <PageHeader title="天気" onBack={() => setView("services")} right={
        <button onClick={locate} className="p-2 rounded-full hover:bg-gray-100" aria-label="現在地"><MapPin className="w-5 h-5 text-gray-500" /></button>
      } />
      <div className="px-3 py-2 relative shrink-0">
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && search()} placeholder="都市名で検索（例：大阪）" className="flex-1 bg-white rounded-full px-4 py-2 text-sm outline-none border" />
          <button onClick={search} className="px-4 rounded-full bg-green-500 text-white" aria-label="検索"><Search className="w-4 h-4" /></button>
        </div>
        {results.length > 0 && (
          <div className="absolute left-3 right-3 top-14 bg-white border rounded-2xl shadow-xl z-10 overflow-hidden">
            {results.map((r, i) => (
              <button key={i} onClick={() => choose(r)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0">
                <div className="text-sm font-bold">{r.name}</div>
                <div className="text-xs text-gray-400">{r.sub}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
        {loading && <Spinner />}
        {!loading && error && <div className="text-center text-sm text-gray-400 py-16">天気を取得できませんでした</div>}
        {!loading && cur && (
          <>
            <div className="text-center pt-4 pb-6">
              <div className="text-sm font-bold text-gray-600">{city.name}</div>
              <div className="text-7xl my-2">{WMO(cur.weather_code)[1]}</div>
              <div className="text-6xl font-light">{Math.round(cur.temperature_2m)}°</div>
              <div className="text-sm text-gray-500 mt-1">{WMO(cur.weather_code)[0]} ・ 最高 {Math.round(data.daily.temperature_2m_max[0])}° / 最低 {Math.round(data.daily.temperature_2m_min[0])}°</div>
              <div className="flex justify-center gap-5 text-xs text-gray-500 mt-4">
                <span className="flex items-center gap-1"><Thermometer className="w-4 h-4" />体感 {Math.round(cur.apparent_temperature)}°</span>
                <span className="flex items-center gap-1"><Droplets className="w-4 h-4" />湿度 {cur.relative_humidity_2m}%</span>
                <span className="flex items-center gap-1"><Wind className="w-4 h-4" />風 {Math.round(cur.wind_speed_10m)}km/h</span>
              </div>
            </div>

            <div className="mx-3 bg-white/80 rounded-2xl border p-3">
              <div className="text-xs font-bold text-gray-400 mb-2">24時間予報</div>
              <div className="flex gap-4 overflow-x-auto scrollbar-hide">
                {hourly.map((h, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 min-w-[40px]">
                    <span className="text-[11px] text-gray-500">{h.hour}</span>
                    <span className="text-xl">{WMO(h.code)[1]}</span>
                    <span className="text-sm font-bold">{h.temp}°</span>
                    <span className="text-[10px] text-sky-500">{h.pop ?? 0}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-3 mt-3 bg-white/80 rounded-2xl border divide-y">
              {data.daily.time.map((t, i) => {
                const d = new Date(t + "T00:00:00");
                return (
                  <div key={t} className="flex items-center px-4 py-2.5 text-sm">
                    <span className="w-16 font-bold">{i === 0 ? "今日" : `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`}</span>
                    <span className="text-xl w-10">{WMO(data.daily.weather_code[i])[1]}</span>
                    <span className="text-xs text-sky-500 flex-1">{data.daily.precipitation_probability_max[i] ?? 0}%</span>
                    <span className="font-bold">{Math.round(data.daily.temperature_2m_max[i])}°</span>
                    <span className="text-gray-400 ml-2 w-8 text-right">{Math.round(data.daily.temperature_2m_min[i])}°</span>
                  </div>
                );
              })}
            </div>
            <div className="text-center text-[10px] text-gray-400 mt-4">Weather data by Open-Meteo.com</div>
          </>
        )}
      </div>
    </div>
  );
};

export default WeatherView;
