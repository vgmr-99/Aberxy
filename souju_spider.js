/*
 * souju_spider.js — 搜剧AI(souju.ai) 的 FongMi/TV 影视TV 单采集源 (QuickJS / CatVod)
 *
 * 用法（影视TV 配置里）：
 *   sites[]: { "key":"souju", "name":"搜剧AI souju.ai", "type":3,
 *              "api":"https://raw.githubusercontent.com/vgmr-99/Aberxy/main/souju_spider.js",
 *              "searchable":1, "playable":1 }
 * 整站即作为一个“单个采集源”按需浏览与点播，无需预解析。
 *
 * 实现要点：
 *  - type=3 + api 以 .js 结尾 → 影视TV 用 QuickJS 加载本文件。
 *  - 内部复刻前端 HMAC-SHA256 签名调用 souju.ai 的 /v1/* 接口（纯 JS 实现，无外部依赖）。
 *  - 网络请求走 QuickJS 全局 net.req(url, {method,headers,timeout})，body 在 resp.content。
 *  - 方法名 / 返回结构遵循 CatVod 规范：home/category/detail/search/play。
 */

// ===================== 纯 JS 工具：HMAC-SHA256（无 require/crypto 依赖） =====================
function _randHex(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
}
function _utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
        else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return out;
}
function _hexToBytes(hex) {
    var out = [];
    for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
}
function _sha256(msgStr) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = 'length';
    var i, j, result = '', words = [], asciiBitLength = msgStr.length * 8;
    var hash = _sha256.h = _sha256.h || [], k = _sha256.k = _sha256.k || [], primeCounter = 0, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    var ascii = msgStr + '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = asciiBitLength;
    for (j = 0; j < words.length;) {
        var w = words.slice(j, j += 16), oldHash = hash, hash2 = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            var i2 = i + j, w15 = w[i - 15], w2 = w[i - 2], a = hash2[0], e = hash2[4];
            var temp1 = hash2[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash2[5]) ^ ((~e) & hash2[6])) + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash2[1]) ^ (a & hash2[2]) ^ (hash2[1] & hash2[2]));
            hash2 = [(temp1 + temp2) | 0].concat(hash2);
            hash2[4] = (hash2[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) hash2[i] = (hash2[i] + oldHash[i]) | 0;
        hash = hash2;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
    }
    return result;
}
function _hmacSha256(keyStr, msgStr) {
    var blockSize = 64;
    var keyBytes = _utf8Bytes(keyStr);
    if (keyBytes.length > blockSize) keyBytes = _hexToBytes(_sha256(keyStr));
    while (keyBytes.length < blockSize) keyBytes.push(0);
    var inner = [], outer = [];
    for (var i = 0; i < blockSize; i++) { inner.push(keyBytes[i] ^ 0x36); outer.push(keyBytes[i] ^ 0x5c); }
    var innerMsg = inner.concat(_utf8Bytes(msgStr));
    var innerHash = _hexToBytes(_sha256(String.fromCharCode.apply(null, innerMsg)));
    var outerMsg = outer.concat(innerHash);
    return _sha256(String.fromCharCode.apply(null, outerMsg));
}

// ===================== 站点常量 + 签名 + 请求 =====================
var SITE = "https://souju.ai";
var CI = "f39d73aa7a6426203cdee1ef17b31d3b7ea8c23f4c59c62a3a8aa0f39ee5e79d";

function _sign(method, path) {
    var ts = String(Date.now());
    var nonce = _randHex(32);
    var msg = method + "\n" + path + "\n" + ts + "\n" + nonce;
    var sig = _hmacSha256(CI, msg);
    return {
        "x-ai-movie-timestamp": ts,
        "x-ai-movie-nonce": nonce,
        "x-ai-movie-signature": sig,
        "Origin": SITE,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
    };
}

// 同步请求：走 QuickJS 全局 net.req；返回解析后的 JSON 对象
function _get(path) {
    var headers = _sign("GET", path);
    var resp = net.req(SITE + path, { method: "GET", headers: headers, timeout: 15000, callTimeout: 15000 });
    if (resp.error) throw new Error(resp.error);
    if (resp.code < 200 || resp.code >= 300) throw new Error("HTTP " + resp.code);
    var body = resp.content;
    if (typeof body !== "string") {
        // 极少数情况下 content 为字节数组，转成字符串
        body = String.fromCharCode.apply(null, Array.prototype.slice.call(body));
    }
    return JSON.parse(body);
}

function _m3u8(body) {
    var txt = typeof body === "string" ? body : JSON.stringify(body);
    var set = {};
    (txt.match(/https?:\/\/[^\s"']+?\.m3u8/g) || []).forEach(function (u) { set[u] = 1; });
    return Object.keys(set);
}

// ===================== CatVod 接口（方法名与返回结构遵循规范） =====================
function init(ext) {
    // souju 无需初始化参数
}

function home(filter) {
    return {
        class: [
            { type_id: "all", type_name: "全部" },
            { type_id: "movie", type_name: "电影" },
            { type_id: "series", type_name: "剧集" },
            { type_id: "anime", type_name: "动漫" }
        ]
    };
}

function category(tid, pg, filter, extend) {
    pg = pg || 1;
    var data = _get("/v1/browse/catalog?limit=20&intent=latest_catalog&page=" + pg);
    var cards = data.cards || [];
    if (tid && tid !== "all") cards = cards.filter(function (c) { return (c.content_kind || "") === tid; });
    var list = cards.map(function (c) {
        return {
            vod_id: c.id,
            vod_name: c.title,
            vod_pic: c.poster_url || "",
            vod_remarks: [c.content_kind, c.year].filter(Boolean).join(" ")
        };
    });
    var total = (data.pagination && data.pagination.total) || 0;
    return { page: Number(pg), pagecount: Math.max(1, Math.ceil(total / 20)), list: list };
}

function detail(id) {
    var vid = Array.isArray(id) ? id[0] : id;
    var data = _get("/v1/catalog/" + vid);
    var title = data.title || vid;
    var eps = data.episodes || [];
    // 每集 “集名$token” 用 # 连接；播放时 play() 取 token 现解析直链
    var play = eps.map(function (e) {
        return (e.title || ("第" + (e.number || "?") + "集")) + "$" + e.token;
    }).join("#");
    var item = {
        vod_id: vid,
        vod_name: title,
        vod_pic: data.poster_url || "",
        vod_content: data.description || "",
        vod_play_from: "souju",
        vod_play_url: play
    };
    return { list: [item] };
}

function search(key, quick, pg) {
    pg = pg || 1;
    var out = [];
    for (var p = 1; p <= 10 && out.length < 60; p++) {
        var data = _get("/v1/browse/catalog?limit=20&intent=latest_catalog&page=" + p);
        (data.cards || []).forEach(function (c) {
            if (out.length < 60 && (c.title || "").indexOf(String(key)) >= 0) {
                out.push({ vod_id: c.id, vod_name: c.title, vod_pic: c.poster_url || "" });
            }
        });
    }
    return { page: Number(pg), pagecount: 1, list: out };
}

function play(flag, id, vipFlags) {
    if (!id) return { parse: 0, url: "" };
    if (id.indexOf("$") >= 0) id = id.split("$").pop();   // 兼容 “flag$id”
    if (id.indexOf("http") === 0) return { parse: 0, url: id };
    var data = _get("/v1/playback/resolve/" + id);
    var urls = _m3u8(data);
    return { parse: 0, url: urls[0] || "" };
}

// 可选：本地代理（一般无需）
function proxy(params) { return null; }
