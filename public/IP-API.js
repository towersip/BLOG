
/*
 * Quantumult X - IP 归属地增强版
 * API: ip-api.com + proxycheck.io v3
 *
 * 第一行：🇺🇸 洛杉矶
 * 第二行：IP | ISP | ASN | 网络类型
 */

// 填写你的 proxycheck.io API Key
const API_KEY = "221893-l94t18-4652ge-09w242";

// 常见城市中文名称
const cityMap = {
  "Los Angeles": "洛杉矶",
  "San Jose": "圣何塞",
  "San Francisco": "旧金山",
  "New York": "纽约",
  "Seattle": "西雅图",
  "Chicago": "芝加哥",
  "Dallas": "达拉斯",
  "Miami": "迈阿密",
  "Tokyo": "东京",
  "Osaka": "大阪",
  "Singapore": "新加坡",
  "Hong Kong": "香港",
  "Taipei": "台北",
  "Seoul": "首尔",
  "London": "伦敦",
  "Frankfurt": "法兰克福",
  "Frankfurt am Main": "法兰克福",
  "Amsterdam": "阿姆斯特丹",
  "Sydney": "悉尼"
};

// 国旗转换
function getFlag(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) {
    return "🌐";
  }

  return [...code].map(c =>
    String.fromCodePoint(
      c.charCodeAt(0) + 127397
    )
  ).join("");
}

// 网络类型
function getType(network, data) {
  const types = {
    Residential: "家宽",
    Wireless: "移动网络",
    Hosting: "机房",
    Business: "企业网络"
  };

  const type = network && network.type;

  // 优先使用 proxycheck
  if (type && types[type]) {
    return types[type];
  }

  // 使用 ip-api 备用判断
  if (data.mobile === true) {
    return "移动网络";
  }

  if (data.hosting === true) {
    return "机房";
  }

  return "未知";
}

// 运营商名称
function getISP(data, network) {
  const raw = String(
    (network && network.provider) ||
    data.org ||
    data.isp ||
    "未知运营商"
  );

  const known = [
    [/DMIT/i, "DMIT"],
    [/NetLab/i, "NetLab Global"],
    [/Cloudflare/i, "Cloudflare"],
    [/Amazon|AWS/i, "AWS"],
    [/Google/i, "Google"],
    [/Microsoft|Azure/i, "Azure"],
    [/Akamai|Linode/i, "Akamai"],
    [/DigitalOcean/i, "DigitalOcean"],
    [/Vultr|Choopa/i, "Vultr"],
    [/Hetzner/i, "Hetzner"],
    [/OVH/i, "OVH"],
    [/AT&T/i, "AT&T"],
    [/Verizon/i, "Verizon"],
    [/T-Mobile/i, "T-Mobile"],
    [/China Telecom|中国电信/i, "中国电信"],
    [/China Unicom|中国联通/i, "中国联通"],
    [/China Mobile|中国移动/i, "中国移动"]
  ];

  for (const [regex, name] of known) {
    if (regex.test(raw)) {
      return name;
    }
  }

  return raw.replace(
    /,?\s*(Inc\.?|LLC|Ltd\.?|Limited|Corporation)$/i,
    ""
  ).trim();
}

// ASN 格式
function getASN(network, data) {
  const raw = String(
    (network && network.asn) ||
    data.as ||
    ""
  );

  const match = raw.match(/AS\d+/i);

  return match
    ? match[0].toUpperCase()
    : "未知ASN";
}

// 显示结果
function display(data, network) {
  network = network || {};

  const ip = data.query || "未知IP";

  const cityRaw =
    data.city ||
    data.regionName ||
    data.country ||
    "未知地区";

  const city = cityMap[cityRaw] || cityRaw;

  const flag = getFlag(data.countryCode);
  const isp = getISP(data, network);
  const asn = getASN(network, data);
  const type = getType(network, data);

  const title = flag + " " + city;

  const subtitle = [
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
      "IP：" + ip,
      "国家：" + (data.country || ""),
      "城市：" + city,
      "运营商：" + isp,
      "ASN：" + asn,
      "网络类型：" + type
    ].join("\n")
  });
}

// 主程序
try {
  const data = JSON.parse($response.body);

  if (data.status !== "success") {
    $done({
      title: "IP 查询失败",
      subtitle: data.message || "API 返回异常"
    });
  } else if (!data.query) {
    $done({
      title: "IP 查询失败",
      subtitle: "未获取到出口 IP"
    });
  } else {
    const ip = data.query;

    // 构造 proxycheck 请求
    const key = API_KEY &&
      API_KEY !== "在这里填写你的新KEY"
        ? "?key=" + encodeURIComponent(API_KEY)
        : "";

    const url =
      "https://proxycheck.io/v3/" +
      encodeURIComponent(ip) +
      key;

    console.log(
      "[GeoLocation] Checking " + ip
    );

    // 异步查询 IP 类型
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

        if (
          result.status !== "ok" &&
          result.status !== "warning"
        ) {
          console.log(
            "[GeoLocation] proxycheck failed: " +
            JSON.stringify(result).slice(0, 500)
          );
          display(data, {});
          return;
        }

        const record = result[ip] || {};
        const network = record.network || {};

        console.log(
          "[GeoLocation] network: " +
          JSON.stringify(network)
        );

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

} catch (error) {
  console.log(
    "[GeoLocation] Script error: " + error
  );

  $done({
    title: "脚本错误",
    subtitle: String(error)
  });
}
