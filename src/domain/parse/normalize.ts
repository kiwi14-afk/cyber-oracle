/**
 * 商户名归一化
 * ------------------------------------------------------------------
 * 真实账单里同一个商户会长出十几种写法：
 *   「支付宝-美团外卖（北京）有限公司」「财付通-美团****旗舰店」
 *   「上海星巴克咖啡有限公司」「肯德基(南屏街店)」
 * 归一是为了：① 聚合排行不炸成几百条；② 识别「同一商户反复扣款」= 订阅。
 */

const NOISE_PATTERNS: RegExp[] = [
  /支付宝[-\s:：]*/g,
  /财付通[-\s:：]*/g,
  /微信支付[-\s:：]*/g,
  /银联[-\s:：]*/g,
  /快捷支付[-\s:：]*/g,
  /（[^）]{0,24}）/g,
  /\([^)]{0,24}\)/g,
  // 企业后缀
  /(有限责任公司|股份有限公司|有限公司|分公司|支公司|公司)/g,
  /(网络科技|网络技术|信息技术|信息科技|文化传媒|电子商务|商贸|实业|科技|商贸行|经营部|服务部)/g,
  /[*＊]{1,}/g,
  /(旗舰店|专营店|专卖店|官方店|自营店|直营店)$/g,
];

/** 抖音、淘宝等平台订单号会直接拼在商户名后面 */
const LONG_DIGITS = /\d{6,}/g;

export function normalizeMerchant(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  for (const re of NOISE_PATTERNS) s = s.replace(re, "");
  s = s.replace(LONG_DIGITS, "");
  s = s.replace(/[\s\u3000]+/g, "");
  s = s.replace(/^[-—_/]+|[-—_/]+$/g, "");
  s = s.toLowerCase();
  return s || raw.trim().toLowerCase();
}

/** 展示名：去掉企业后缀但保留原始大小写，避免把「星巴克」显示成小写 */
export function displayMerchant(raw: string): string {
  if (!raw) return "未知商户";
  let s = raw
    .replace(/^支付宝-/, "")
    .replace(/^财付通-/, "")
    .replace(/^微信支付-/, "")
    .replace(/（[^）]{0,24}）/g, "")
    .replace(/\([^)]{0,24}\)/g, "")
    .replace(/(有限责任公司|股份有限公司|有限公司|分公司|支公司)/g, "")
    .trim();
  s = s.replace(/^[-—_/]+|[-—_/]+$/g, "").trim();
  return s || raw;
}
