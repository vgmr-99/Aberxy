/*
 * souju_spider.js — 搜剧AI(souju.ai) 影视TV(FongMi/TV) 单采集源  v3
 *
 * 修复记录：
 *  v3: ① 分类改用服务端真实参数 kind=（此前 intent= 被忽略→所有分类同一批内容）
 *      ② home() 返回整站 6 个真实分类：剧集/电影/动漫/短剧/综艺/纪录片
 *      ③ 搜索改用服务端 q= 参数（此前翻页过滤，深页内容搜不到）
 *      ④ 多播放源：detail 时解析第1集拿全部线路(ikun资源/魔都资源...)，
 *         每条线路一个播放组，播放器内可直接切换线路；
 *         多季作品自动展开为"第N季"分组。
 *
 * 遵循 FongMi/CatVodSpider QuickJS 官方契约：
 *   ES module export default 工厂；方法 init/home/homeVod/category/detail/search/play/proxy/destroy；
 *   网络 net.http(url,{method,headers,timeout}) → {code,content,error}（异步）。
 * 配置（type 必须 3，api 以 .js 结尾）。
 */

// ===================== 纯 JS HMAC-SHA256（无依赖，已逐字节对验 node crypto） =====================
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

var _K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

function _rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function _sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var bitLenHi = Math.floor(len / 0x20000000);
    var bitLenLo = (len << 3) >>> 0;
    var padded = bytes.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    padded.push((bitLenHi >>> 24) & 0xff, (bitLenHi >>> 16) & 0xff, (bitLenHi >>> 8) & 0xff, bitLenHi & 0xff);
    padded.push((bitLenLo >>> 24) & 0xff, (bitLenLo >>> 16) & 0xff, (bitLenLo >>> 8) & 0xff, bitLenLo & 0xff);
    var w = new Array(64);
    for (var i = 0; i < padded.length; i += 64) {
        for (var t = 0; t < 16; t++) {
            w[t] = (padded[i + t * 4] << 24) | (padded[i + t * 4 + 1] << 16) | (padded[i + t * 4 + 2] << 8) | padded[i + t * 4 + 3];
        }
        for (t = 16; t < 64; t++) {
            var s0 = _rotr(w[t - 15], 7) ^ _rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
            var s1 = _rotr(w[t - 2], 17) ^ _rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
        }
        var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (t = 0; t < 64; t++) {
            var S1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
            var ch = (e & f) ^ (~e & g);
            var temp1 = (h + S1 + ch + _K[t] + w[t]) | 0;
            var S0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var temp2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + temp1) | 0;
            d = c; c = b; b = a; a = (temp1 + temp2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + ((H[i] >>> 0).toString(16))).slice(-8);
    return out;
}

function _sha256Str(str) { return _sha256Bytes(_utf8Bytes(str)); }

function _hmacSha256(keyStr, msgStr) {
    var key = _utf8Bytes(keyStr);
    if (key.length > 64) key = _hexToBytes(_sha256Bytes(key));
    while (key.length < 64) key.push(0);
    var inner = [], outer = [];
    for (var i = 0; i < 64; i++) { inner.push(key[i] ^ 0x36); outer.push(key[i] ^ 0x5c); }
    var innerHash = _hexToBytes(_sha256Bytes(inner.concat(_utf8Bytes(msgStr))));
    return _sha256Bytes(outer.concat(innerHash));
}

// ===================== souju.ai API（HMAC 签名） =====================
var CI = 'f39d73aa7a6426203cdee1ef17b31d3b7ea8c23f4c59c62a3a8aa0f39ee5e79d';
var BASE = 'https://souju.ai';

async function _http(path) {
    var ts = String(Date.now());
    var no = _randHex(32);
    var msg = 'GET\n' + path + '\n' + ts + '\n' + no;
    var sig = _hmacSha256(CI, msg);
    var resp = await net.http(BASE + path, {
        method: 'GET',
        headers: {
            'x-ai-movie-timestamp': ts,
            'x-ai-movie-nonce': no,
            'x-ai-movie-signature': sig,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
            'Referer': 'https://souju.ai/',
        },
        timeout: 20000,
    });
    if (resp.error) throw new Error('HTTP失败: ' + resp.error);
    var body = resp.content;
    if (typeof body !== 'string') body = new TextDecoder().decode(body);
    var data = JSON.parse(body);
    if (!data || !data.cards) return data;
    return data;
}

// 目录查询：kind 分类过滤 / q 搜索，统一走 /v1/browse/catalog
async function _catalog(params) {
    var qs = 'limit=20';
    for (var k in params) if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        qs += '&' + k + '=' + encodeURIComponent(params[k]);
    }
    return await _http('/v1/browse/catalog?' + qs);
}

function _cardToVod(c) {
    return {
        vod_id: c.id,
        vod_name: c.title || c.name || '',
        vod_pic: c.poster_url || '',
        vod_remarks: c.remarks || (c.year ? String(c.year) : ''),
    };
}

// 从 resolve 结果里挑出多线路信息：[{label, url, weight, selected}]
function _lines(resolveData) {
    var out = [];
    var opts = (resolveData && resolveData.line_options) || [];
    opts.forEach(function (o) {
        if (o && o.url && /\.m3u8|\.mp4|\.flv/i.test(o.url)) {
            out.push({
                label: o.display_label || o.provider_name || o.label || '默认线路',
                url: o.url,
                weight: o.preference_weight || 0,
                selected: !!o.selected,
            });
        }
    });
    // 兜底：没有 line_options 就全文抓 m3u8
    if (!out.length && resolveData) {
        var seen = {};
        function walk(o) {
            if (!o) return;
            if (typeof o === 'string') {
                if (/https?:\/\/[^\s"']+\.(m3u8|mp4|flv)/i.test(o) && !seen[o]) { seen[o] = 1; out.push({ label: '默认线路', url: o, weight: 0, selected: true }); }
                return;
            }
            if (Array.isArray(o)) { o.forEach(walk); return; }
            if (typeof o === 'object') Object.keys(o).forEach(function (k) { if (k !== 'token' && k !== 'tokens') walk(o[k]); });
        }
        walk(resolveData);
    }
    out.sort(function (a, b) { return (b.selected - a.selected) || (b.weight - a.weight); });
    return out;
}

// ===================== 入口（QuickJS：export default 工厂） =====================

export default function createSpider(site) {
    site = site || {};

    var _class = [
        { type_id: 'series', type_name: '剧集' },
        { type_id: 'movie', type_name: '电影' },
        { type_id: 'anime', type_name: '动漫' },
        { type_id: 'short_drama', type_name: '短剧' },
        { type_id: 'variety', type_name: '综艺' },
        { type_id: 'documentary', type_name: '纪录片' },
    ];

    async function init(ext) {}

    async function home(filter) {
        return { class: _class };
    }

    async function homeVod() {
        var data = await _catalog({ intent: 'latest_catalog', page: 1 });
        return { list: (data.cards || []).map(_cardToVod) };
    }

    // 分类：服务端 kind= 真实过滤
    async function category(tid, pg, filter, extend) {
        pg = Number(pg) || 1;
        var data = await _catalog({ kind: tid, page: pg });
        var cards = data.cards || [];
        var pag = data.pagination || {};
        var pagecount = pag.total ? Math.ceil(pag.total / (pag.limit || 20)) : (pag.has_more ? pg + 1 : pg);
        return { page: pg, pagecount: pagecount, limit: 20, list: cards.map(_cardToVod) };
    }

    // 详情：多季展开 + 多线路分组
    async function detail(id) {
        var data = await _http('/v1/catalog/' + id);
        var seasons = data.seasons || [];
        var groups = []; // [{label, episodes:[{name, token}]}]

        // 单季：直接用当前 episodes
        function curGroup(label, eps) {
            var list = [];
            (eps || []).forEach(function (ep, i) {
                list.push({ name: ep.title || ep.display_name || ('第' + (i + 1) + '集'), token: ep.token || '' });
            });
            if (list.length) groups.push({ label: label, episodes: list });
        }

        if (seasons.length > 1) {
            // 多季：逐季取集数（最多 5 季，防请求爆炸）
            var want = seasons.slice(0, 5);
            for (var i = 0; i < want.length; i++) {
                var s = want[i];
                try {
                    var sd = await _http('/v1/catalog/' + (s.variant_id || s.id));
                    var lbl = s.season_label || s.title || ('第' + (i + 1) + '季');
                    curGroup(lbl, sd.episodes || []);
                } catch (e) { /* 单季失败跳过 */ }
            }
            if (!groups.length) curGroup('正片', data.episodes || []);
        } else {
            curGroup('正片', data.episodes || []);
        }

        // 用第1集解析一次，拿全部播放线路 → 每条线路一个播放组（播放器里可切换）
        var providers = null;
        var firstEp = groups.length && groups[0].episodes.length ? groups[0].episodes[0] : null;
        if (firstEp && firstEp.token) {
            try {
                var res = await _http('/v1/playback/resolve/' + firstEp.token);
                var lines = _lines(res);
                if (lines.length > 1) {
                    providers = lines.map(function (l) { return l.label; });
                } else if (lines.length === 1) {
                    providers = null; // 单线路无需分组
                }
            } catch (e) { providers = null; }
        }

        var playFrom = [], playUrl = [];
        if (providers) {
            providers.forEach(function (p) {
                playFrom.push(p);
                playUrl.push(groups.map(function (g) {
                    var prefix = groups.length > 1 ? (g.label + ' ') : '';
                    return g.episodes.map(function (ep) { return prefix + ep.name + '$' + ep.token; }).join('#');
                }).join('#'));
            });
        } else {
            groups.forEach(function (g) {
                playFrom.push(g.label);
                playUrl.push(g.episodes.map(function (ep) { return ep.name + '$' + ep.token; }).join('#'));
            });
        }

        var item = {
            vod_id: id,
            vod_name: data.title || '',
            vod_pic: data.poster_url || '',
            vod_year: String(data.year || ''),
            vod_area: data.area || '',
            vod_actor: (data.actors || []).slice(0, 8).join(' '),
            vod_director: (data.directors || []).slice(0, 4).join(' '),
            vod_remarks: data.remarks || (data.episode_count ? '全' + data.episode_count + '集' : ''),
            vod_content: data.description || '',
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playUrl.join('$$$'),
        };
        return { list: [item] };
    }

    // 搜索：服务端 q= 真搜索（带分页）
    async function search(key, quick, pg) {
        pg = Number(pg) || 1;
        var data = await _catalog({ q: key, page: pg });
        var pag = data.pagination || {};
        var pagecount = pag.total ? Math.ceil(pag.total / (pag.limit || 20)) : 1;
        return { page: pg, pagecount: pagecount, limit: 20, list: (data.cards || []).map(_cardToVod) };
    }

    // 播放：resolve 该集，按线路 flag 匹配，失败回退 selected/最高权重
    async function play(flag, id, vipFlags) {
        if (!id) return { parse: 0, url: '' };
        if (id.indexOf('$') >= 0) id = id.split('$').pop();
        if (id.indexOf('http') === 0) return { parse: 0, url: id };
        var res = await _http('/v1/playback/resolve/' + id);
        var lines = _lines(res);
        if (!lines.length) return { parse: 0, url: '' };
        var pick = null;
        if (flag) {
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].label === flag) { pick = lines[i]; break; }
            }
        }
        if (!pick) {
            for (i = 0; i < lines.length; i++) if (lines[i].selected) { pick = lines[i]; break; }
        }
        if (!pick) pick = lines[0]; // 已按 selected + weight 排序
        return { parse: 0, url: pick.url, header: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' } };
    }

    function proxy(params) { return null; }

    function destroy() {}

    return { init, home, homeVod, category, detail, search, play, proxy, destroy };
}
