
const data = JSON.parse($response.body);

if (data.status !== "success") {
  $done({
    title: "IP 查询失败",
    subtitle: data.message || "请检查网络"
  });
} else {
  const flag = [...(data.countryCode || "")]
    .map(c => String.fromCodePoint(
      c.charCodeAt(0) + 127397
    )).join("");

  const cityMap = {
    "Los Angeles": "洛杉矶",
    "San Jose": "圣何塞",
    "San Francisco": "旧金山",
    "New York": "纽约",
    "Tokyo": "东京",
    "Osaka": "大阪",
    "Singapore": "新加坡",
    "Hong Kong": "香港",
    "Taipei": "台北",
    "Seoul": "首尔"
  };

  const city = cityMap[data.city] ||
               data.city ||
               data.country;

  const asn = (data.as || "").match(/AS\d+/)?.[0] || "";

  const org = data.org || data.isp || "";
  const isp = org.split(/[,，]/)[0].trim();

  const type = /hosting|cloud|server|data center|dmit/i
    .test([data.isp, data.org, data.as].join(" "))
    ? "机房" : "未知";

  $done({
    title: `${flag} ${city}`,
    subtitle: [
      data.query,
      isp,
      asn,
      type
    ].filter(Boolean).join(" | "),
    ip: data.query,
    description: [
      `国家：${data.country}`,
      `城市：${city}`,
      `IP：${data.query}`,
      `运营商：${data.isp}`,
      `组织：${data.org}`,
      `ASN：${data.as}`
    ].join("\n")
  });
}
