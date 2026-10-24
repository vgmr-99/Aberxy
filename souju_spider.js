/*
 * souju_spider.js — 搜剧AI(souju.ai) 的 CatVod 风格采集源(spider)
 * 用法：影视TV(FongMi/TV) 配置里以 type=4 / api=本文件 raw URL 接入，
 *       整站即作为一个“单个采集源”按需浏览与点播，无需预解析。
 * 内部复刻前端 HMAC-SHA256 签名调用 souju.ai 的 /v1/* 接口。
 * 关键点：签名用纯 JS 实现，不依赖 require('crypto')，兼容任意 spider 引擎(含影视TV的 Java JS 引擎)。
 */

// ---------- 纯 JS 工具 ----------
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

function _bytesToStr(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff);
    return s;
}

function _hexToBytes(hex) {
    var out = [];
    for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
}

// 纯 JS SHA-256（geraintluff 实现，按 UTF-8 字节串运算）
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
    var innerHash = _hexToBytes(_sha256(_bytesToStr(innerMsg)));
    var outerMsg = outer.concat(innerHash);
    return _sha256(_bytesToStr(outerMsg));
}

// ---------- Spider 类 ----------
var Spider = class {
    constructor() {
        this.siteUrl = "https://souju.ai";
        this.ci = "f39d73aa7a6426203cdee1ef17b31d3b7ea8c23f4c59c62a3a8aa0f39ee5e79d";
    }

    async init(cfg) { this.cfg = cfg || {}; }

    _sign(method, path) {
        const ts = Date.now().toString();
        const nonce = _randHex(32);
        const msg = method + "\n" + path + "\n" + ts + "\n" + nonce;
        const sig = _hmacSha256(this.ci, msg);
        return {
            'x-ai-movie-timestamp': ts,
            'x-ai-movie-nonce': nonce,
            'x-ai-movie-signature': sig,
            'Origin': this.siteUrl,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
        };
    }

    async _get(path) {
        const headers = this._sign('GET', path);
        const url = this.siteUrl + path;
        // 1) CatVod 运行时自带 this._request(url, headers)
        if (typeof this._request === 'function') {
            const body = await this._request(url, headers);
            return typeof body === 'string' ? JSON.parse(body) : body;
        }
        // 2) 现代运行时全局 fetch
        if (typeof fetch === 'function') {
            const r = await fetch(url, { headers });
            return JSON.parse(await r.text());
        }
        // 3) Node https 兜底（仅本地测试用）
        return await new Promise((resolve, reject) => {
            const https = require('https');
            const req = https.request(url, { method: 'GET', headers }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
            });
            req.on('error', reject);
            req.end();
        });
    }

    _m3u8(body) {
        const txt = typeof body === 'string' ? body : JSON.stringify(body);
        const set = {};
        (txt.match(/https?:\/\/[^\s"']+?\.m3u8/g) || []).forEach(u => set[u] = 1);
        return Object.keys(set);
    }

    // ---------- CatVod 接口 ----------
    async home() {
        return { class: [
            { type_id: 'all', type_name: '全部' },
            { type_id: 'movie', type_name: '电影' },
            { type_id: 'series', type_name: '剧集' },
            { type_id: 'anime', type_name: '动漫' }
        ] };
    }

    async category(tid, pg, filter, extend) {
        pg = pg || 1;
        const data = await this._get(`/v1/browse/catalog?limit=20&intent=latest_catalog&page=${pg}`);
        let cards = data.cards || [];
        if (tid && tid !== 'all') cards = cards.filter(c => (c.content_kind || '') === tid);
        const list = cards.map(c => ({
            vod_id: c.id,
            vod_name: c.title,
            vod_pic: c.poster_url || '',
            vod_remarks: [c.content_kind, c.year].filter(Boolean).join(' ')
        }));
        const total = (data.pagination && data.pagination.total) || 0;
        return { page: pg * 1, pagecount: Math.max(1, Math.ceil(total / 20)), list };
    }

    async detail(id) {
        const data = await this._get(`/v1/catalog/${id}`);
        const title = data.title || id;
        const eps = data.episodes || [];
        // 惰性解析：play_url 只放每集 token，点击时由 play() 现解析直链（取最新、按需）
        const play = eps.map(e => `${e.title || ('第' + (e.number || '?') + '集')}$${e.token}`).join('#');
        return {
            list: [{
                vod_id: id,
                vod_name: title,
                vod_pic: data.poster_url || '',
                vod_content: data.description || '',
                vod_play_url: play
            }]
        };
    }

    async search(wd) {
        const out = [];
        for (let pg = 1; pg <= 10 && out.length < 60; pg++) {
            const data = await this._get(`/v1/browse/catalog?limit=20&intent=latest_catalog&page=${pg}`);
            (data.cards || [])
                .filter(c => (c.title || '').indexOf(wd) >= 0)
                .forEach(c => out.push({ vod_id: c.id, vod_name: c.title, vod_pic: c.poster_url || '' }));
        }
        return { list: out };
    }

    async play(flag, id) {
        if (!id) return { parse: 0, url: '' };
        if (id.indexOf('$') >= 0) id = id.split('$').pop();   // 兼容部分引擎传入 "flag$id"
        if (id.indexOf('http') === 0) return { parse: 0, url: id };
        const data = await this._get(`/v1/playback/resolve/${id}`);
        const urls = this._m3u8(data);
        return { parse: 0, url: urls[0] || '' };
    }

    async proxy(...args) { return null; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Spider;
