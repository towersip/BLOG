
/*
 * Quantumult X - IP 归属地增强版
 * ip-api.com + proxycheck.io v3
 *
 * 第一行：国旗 城市
 * 第二行：IP | ISP | ASN | 网络类型
 */

// 可选：填写 proxycheck.io 免费 API Key
const API_KEY = "";

function getFlag(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) return "🌐";
  return [...code].map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join("");
}

function getType(type, data) {
  const types = {
    Residential: "家宽",
    Wireless: "移动网络",
    Hosting: "机房",
    Business: "企业网络"
  };

  if (types[type]) return types[type];

  // proxycheck 无结果时，使用 ip-api 备用判断
  if (data.mobile === true) return "移动网络";
  if (data.hosting === true) return "机房";

  return "未知";
}

function getISP(data, network) {
  const raw = network?.provider ||
              data.org ||
              data.isp ||
              "未知运营商";

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

  return raw
    .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Limited|Corporation)$/i, "")
    .trim();
}

function display(data, network = {}) {
  const ip = data.query || "未知IP";
  const city = data.city || data.regionName ||
               data.country || "未知地区";
  const flag = getFlag(data.countryCode);

  const asn = network.asn ||
              (data.as || "").match(/AS\d+/i)?.[0] ||
              "";

  const isp = getISP(data, network);
  const type = getType(network.type, data);

  const title = `${flag} ${city}`;
  const subtitle = [
    ip, isp, asn, type
  ].filter(Boolean).join(" | ");

  $done({
    title,
    subtitle,
    ip,
    description: [
      `IP：${ip}`,
      `地区：${data.country || ""} ${city}`,
      `运营商：${isp}`,
      `ASN：${asn}`,
      `网络类型：${type}`,
      `组织：${data.org || ""}`
    ].join("\n")
  });
}

try {
  const data = JSON.parse($response.body);

  if (data.status !== "success") {
    $done({
      title: "IP 查询失败",
      subtitle: data.message || "查询异常"
    });
  } else {
    const ip = data.query;
    const key = API_KEY
      ? `&key=${encodeURIComponent(API_KEY)}`
      : "";

    const url =
      `https://proxycheck.io/v3/${encodeURIComponent(ip)}?p=0${key}`;

    $task.fetch({
      url,
      method: "GET"
    }).then(response => {
      try {
        const result = JSON.parse(response.body);
        const network = result[ip]?.network || {};
        display(data, network);
      } catch (e) {
        display(data);
      }
    }).catch(() => {
      display(data);
    });
  }
} catch (e) {
  $done({
    title: "脚本错误",
    subtitle: String(e)
  });
}
