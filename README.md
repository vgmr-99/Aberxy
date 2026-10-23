# Aberxy · 影视TV 播放源配置合集

本仓库整理自《影视TV 介绍与配置》页面（2026.10.22 更新），收录 **7 条播放源配置地址**，覆盖「点播多仓聚合 / 直播 / 备用兜底」三类，并对每条写明**用途与适用软件**。所有地址已于 2026-10-23 实测返回 HTTP 200。

> 适用软件（均兼容 TVBox 协议）：**影视TV（FongMi/TV）**、影视仓、猫影视、天微、TVBox、Pluto Player、影音壳子等。
> 核心用法：客户端「设置 → 配置地址」粘贴下方任一地址即可一键加载。

---

## 一、多仓聚合（点播）

「多仓」即一次性把多个影视站点（爬虫源）聚合到一个界面。下列 4 条指向**同一个 `multi.json`**，只是分发节点不同，内容完全一致。

### 1. jsDelivr CDN 版（推荐国内直连）
- **地址**：`https://cdn.jsdelivr.net/gh/ouyushan/tvbox-cfg@main/config/multi.json`
- **用途**：点播主配置。加载饭太硬(fty)、饭太硬极速、潇洒、OK影视、高天流云等十余个子源。
- **适用软件**：影视TV、影视仓、猫影视、天微、TVBox、Pluto Player 等全部 TVBox 协议客户端。
- **备注**：jsDelivr 国内有 CDN 加速，是最稳的国内直连入口，首选。

### 2. jsDelivr Fastly 版
- **地址**：`https://fastly.jsdelivr.net/gh/ouyushan/tvbox-cfg@main/config/multi.json`
- **用途**：与第 1 条内容相同，走 Fastly 节点。
- **适用软件**：同上。
- **备注**：当 CDN 版偶发限速/慢时作为同内容备用线路。

### 3. 裸地址版（raw.githubusercontent）
- **地址**：`https://raw.githubusercontent.com/ouyushan/tvbox-cfg/main/config/multi.json`
- **用途**：直连 GitHub 源文件。
- **适用软件**：同上（海外网络或能直连 GitHub 的环境）。
- **备注**：国内多数地区会被墙/超时，仅推荐海外或已挂代理的环境使用。

### 4. 裸地址 + gh-proxy 反代版
- **地址**：`https://gh-proxy.com/https://raw.githubusercontent.com/ouyushan/tvbox-cfg/main/config/multi.json`
- **用途**：经 gh-proxy.com 反代 GitHub，等价第 3 条内容。
- **适用软件**：同上（国内被墙环境首选）。
- **备注**：专门解决国内 raw.githubusercontent 拉取失败问题；若 gh-proxy.com 失效可换其他 gh-proxy 域名。

---

## 二、直播源

用于客户端「直播」入口加载电视台，与上面的点播源分开配置（部分客户端支持在点播配置里直接带直播）。

### 5. jsDelivr CDN 版（直播）
- **地址**：`https://cdn.jsdelivr.net/gh/ouyushan/tvbox-cfg@main/config/live.json`
- **用途**：直播主配置。含 iptv-api 聚合(Guovin)、YueChan Live(GNTV)、ngo5 IPTV(IPv4) 等多个电视台源，可分组选台、切线路。
- **适用软件**：影视TV（直播入口）、TVBox 系客户端。
- **备注**：jsDelivr 国内直连，首选。

### 6. 裸地址版（直播）
- **地址**：`https://raw.githubusercontent.com/ouyushan/tvbox-cfg/main/config/live.json`
- **用途**：直播裸源，内容同上。
- **适用软件**：同上（海外/可直连 GitHub 环境）。
- **备注**：国内易超时，不推荐主力使用。

---

## 三、备用兜底源

### 7. fish.json（主配置拉取失败时用）
- **地址**：`https://6800.kstore.vip/fish.json`
- **用途**：一份**完整** TVBox 配置（自带 spider 爬虫 jar、logo、壁纸、弹幕、站点片单等），不依赖外部多仓分发。
- **适用软件**：影视TV、TVBox 系客户端。
- **备注**：当 multi.json 提示「配置拉取失败 / 加载错误」时切换此地址兜底，保证客户端不空。属临时/第三方托管，稳定性不如 jsDelivr 版。

---

## 使用三步（以影视TV 为例）

1. 打开客户端 → **设置 → 配置地址**。
2. 粘贴上方「多仓聚合」任一地址（国内推荐 **第 1 条 jsDelivr CDN 版**）→ 保存，等待加载完成即可看到全部点播源。
3. 直播源单独在「直播入口」填写 **第 5 条 live.json（jsDelivr 版）**；若主配置报错，改用 **第 7 条 fish.json** 兜底。

> 提示：国内网络优先选 **jsDelivr / Fastly** 版；若提示配置拉取失败，改用 gh-proxy 版或 fish.json 备用源。

---

## 免责声明

本仓库仅作信息聚合，所有播放源内容版权归原作者所有。源内容随时可能变动或失效，请自行判断可用性。软件与配置仅供个人学习研究，不得用于商业分发或收费。
