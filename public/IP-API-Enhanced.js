
/*
 * Quantumult X IP 归属地增强版
 * ip-api.com + proxycheck.io v3
 *
 * 第一行：🇺🇸 洛杉矶
 * 第二行：IP | ISP | ASN | 网络类型
 */

// 请换成你重新生成的 proxycheck API Key
const API_KEY = "221893-l94t18-4652ge-09w242";

// 城市中文映射
const cityMap = {
  "Los Angeles": "洛杉矶",
  "San Jose": "圣何塞",
  "San Francisco": "旧金山",
  "New York": "纽约",
  "Seattle": "西雅图",
  "Chicago": "芝加哥",
  "Dallas": "达拉斯",
  "Tokyo": "东京",
  "Osaka": "大阪",
  "Singapore": "新加坡",
  "Hong Kong": "香港",
  "Taipei": "台北",
  "Seoul": "首尔",
  "London": "伦敦",
  "Frankfurt am Main": "法兰克福"
};

function getFlag(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) return "🌐";
  return [...code].map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join("");
}

function getType(network, data) {
  const types = {
    Residential: "家宽",
    Wireless: "移动网络",
    Hosting: "机房",
    Business: "企业网络"
  };

  // 优先 proxycheck
  if (network && types[network.type]) {
    return types[network.type];
  }

  // 其次 ip-api
  if (data.mobile === true) return "移动网络";
  if (data.hosting === true) return "机房";

  // 不把未知 IP 强行识别为家宽
  return "未知";
}

function getISP(data, network) {
  const raw = String(
    (network && network.provider) ||
    data.org ||
    data.isp ||
    "未知运营商"
  );

  const known = [
    [/DMIT/i, "DMIT"],
    [/Cloudflare/i, "Cloudflare"],
    [/Amazon|AWS/i, "AWS"],
    [/Google/i, "Google"],
    [/Microsoft|Azure/i, "Azure"],
    [/Akamai|Linode/i, "Akamai"],
    [/DigitalOcean/i, "DigitalOcean"],
    [/Vultr|Choopa/i, "Vultr"],
    [/AT&T/i, "AT&T"],
    [/Verizon/i, "Verizon"],
    [/T-Mobile/i, "T-Mobile"],
    [/China Telecom|中国电信/i, "中国电信"],
    [/China Unicom|中国联通/i, "中国联通"],
    [/China Mobile|中国移动/i, "中国移动"]
  ];

  for (const [regex, name] of known) {
    if (regex.test(raw)) return name;
  }

  return raw.replace(
    /,?\s*(Inc\.?|LLC|Ltd\.?|Limited|Corporation)$/i,
    ""
  ).trim();
}

function display(data, network) {
  network = network || {};

  const ip = data.query || "未知IP";
  const cityRaw = data.city ||
                  data.regionName ||
                  data.country ||
                  "未知地区";

  const city = cityMap[cityRaw] || cityRaw;
  const flag = getFlag(data.countryCode);

  const asnRaw = String(
    network.asn || data.as || ""
  );

  const asnMatch = asnRaw.match(/AS\d+/i);
  const asn = asnMatch
    ? asnMatch[0].toUpperCase()
    : "未知ASN";

  const isp = getISP(data, network);
  const type = getType(network, data);

  const title = `${flag} ${city}`;
  const subtitle = [
    ip,
    isp,
    asn,
    type
  ].join(" | ");

  console.log(
    "[GeoLocation] " + title + " / " + subtitle
  );

  $done({
    title: title,
    subtitle: subtitle,
    ip: ip,
    description: [
      `IP：${ip}`,
      `国家：${data.country || ""}`,
      `城市：${city}`,
      `运营商：${isp}`,
      `ASN：${asn}`,
      `网络类型：${type}`
    ].join("\n")
  });
}

// 主程序
try {
  const data = JSON.parse($response.body);

  if (data.status !== "success") {
    $done({
      title: "IP 查询失败",
      subtitle: data.message || "查询异常"
    });
  } else {
    const ip = data.query;

    if (!ip) {
      display(data, {});
    } else {
      const key = API_KEY &&
                  API_KEY !== "填写你的新API_KEY"
        ? "?key=" + encodeURIComponent(API_KEY)
        : "";

      const url =
        "https://proxycheck.io/v3/" +
        encodeURIComponent(ip) + key;

      $task.fetch({
        url: url,
        method: "GET"
      }).then(response => {
        try {
          const result = JSON.parse(response.body);

          console.log(
            "[GeoLocation] proxycheck status: " +
            result.status
          );

          const network =
            result[ip] && result[ip].network
              ? result[ip].network
              : {};

          display(data, network);
        } catch (error) {
          console.log(
            "[GeoLocation] Parse error: " + error
          );
          display(data, {});
        }
      }).catch(error => {
        console.log(
          "[GeoLocation] Request error: " + error
        );
        display(data, {});
      });
    }
  }
} catch (error) {
  console.log("[GeoLocation] Error: " + error);
  $done({
    title: "脚本错误",
    subtitle: String(error)
  });
}
