/**
 * 分类体系与规则引擎
 * ------------------------------------------------------------------
 * 设计取舍：不引入任何模型/向量，纯关键词 + 优先级规则。
 * 理由（同步写进技术文档）：
 *   1. 账单分类是「确定性任务」，规则可被单测覆盖，命中率可解释；
 *   2. 评委断网、无 API Key 时仍能跑出完全一致的结果（10 分钟复现的前提）；
 *   3. AI 只负责「讲故事」，不负责「算账」——算错账比讲错故事严重得多。
 */

import type { CategoryKey, CategoryMeta } from "./types";

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  food: { key: "food", label: "餐饮", essential: true },
  transport: { key: "transport", label: "交通", essential: true },
  housing: { key: "housing", label: "居住", essential: true },
  daily: { key: "daily", label: "日用", essential: true },
  medical: { key: "medical", label: "医疗", essential: true },
  shopping: { key: "shopping", label: "购物", essential: false },
  entertainment: { key: "entertainment", label: "娱乐", essential: false },
  learning: { key: "learning", label: "学习", essential: false },
  social: { key: "social", label: "人情", essential: false },
  subscription: { key: "subscription", label: "订阅", essential: false },
  transfer: { key: "transfer", label: "资金搬运", essential: false },
  income: { key: "income", label: "收入", essential: false },
  other: { key: "other", label: "其他", essential: false },
};

interface Rule {
  category: CategoryKey;
  /** 命中任一关键词即归类 */
  keywords: string[];
}

/**
 * 顺序即优先级：越靠前越具体。
 * 例：『美团会员』必须先落到 subscription，再考虑 food。
 */
const RULES: Rule[] = [
  {
    category: "subscription",
    keywords: [
      "会员", "vip", "订阅", "续费", "大会员", "超级会员",
      "app store", "icloud", "apple", "网盘", "云盘", "云服务", "加速器",
      "校园网", "宽带", "流量", "话费", "套餐", "音乐", "网易云", "qq音乐",
      "爱奇艺", "腾讯视频", "优酷", "哔哩哔哩", "bilibili", "芒果tv", "wps",
      "石墨", "notion", "chatgpt", "claude", "剪映", "百度网盘", "喜马拉雅",
      "keep", "印象笔记", "夸克", "梯子", "机场",
    ],
  },
  {
    category: "housing",
    keywords: [
      "房租", "租金", "物业", "水费", "电费", "燃气", "供暖", "水电",
      "公寓", "自如", "链家", "房租水电", "物业管理", "充电桩物业",
    ],
  },
  {
    category: "transport",
    keywords: [
      "地铁", "公交", "打车", "滴滴", "出租车", "高铁", "火车", "12306", "机票",
      "航空", "加油", "汽油", "充电", "停车", "共享单车", "哈啰", "青桔", "摩拜",
      "交通", "车费", "地铁卡", "嘀嗒", "曹操", "t3", "高速费", "过路费",
    ],
  },
  {
    category: "medical",
    keywords: [
      "医院", "药房", "药店", "诊所", "挂号", "体检", "口腔", "牙科", "医保",
      "门诊", "卫生", "疫苗", "眼镜", "配镜",
    ],
  },
  {
    category: "learning",
    keywords: [
      "书店", "图书", "买书", "课程", "培训", "学费", "考试", "教育", "文具",
      "打印", "复印", "知网", "论文", "网课", "得到", "coursera", "udemy",
      "雅思", "托福", "英语", "驾校", "实验室耗材",
    ],
  },
  {
    category: "food",
    keywords: [
      "食堂", "餐", "米线", "米粉", "火锅", "烧烤", "奶茶", "咖啡",
      "饮品", "外卖", "饿了么", "美团", "肯德基", "麦当劳", "星巴克", "瑞幸",
      "蜜雪", "水果", "小吃", "烘焙", "蛋糕", "早点", "早餐", "午餐", "晚餐",
      "夜宵", "盖饭", "炒饭", "米饭", "拌饭", "便当", "饺子", "麻辣烫",
      "沙县", "黄焖", "面馆", "拉面", "卤味", "快餐", "餐厅", "小吃街",
    ],
  },
  {
    category: "daily",
    keywords: [
      "超市", "便利店", "洗衣", "理发", "快递", "生活用品", "纸巾", "沃尔玛",
      "永辉", "盒马", "罗森", "7-11", "711", "全家", "名创", "日用", "洗护",
      "沐浴", "超市购物", "洗发水", "牙膏", "沐浴露", "洗衣液", "洗漱", "清洁用品",
    ],
  },
  {
    category: "entertainment",
    keywords: [
      "电影", "影院", "游戏", "ktv", "酒吧", "剧本杀", "密室", "演唱会", "门票",
      "旅游", "酒店", "民宿", "直播", "盲盒", "手办", "网吧", "桌游", "健身",
      "游泳", "滑雪", "台球", "steam", "王者", "原神", "三角洲", "皮肤",
      "剧院", "话剧", "演出", "展览", "美术馆", "音乐会", "livehouse",
    ],
  },
  {
    // 人情排在购物之前：同样是「淘宝买的生日礼物」，它的人情属性比购物属性更重要
    category: "social",
    keywords: ["红包", "份子", "礼金", "随礼", "人情", "生日礼", "礼物", "代付"],
  },
  {
    category: "shopping",
    keywords: [
      "淘宝", "天猫", "京东", "拼多多", "唯品会", "得物", "服装", "鞋", "数码",
      "手机", "电脑", "耳机", "键盘", "化妆品", "护肤", "美妆", "优衣库",
      "商场", "购物", "闲鱼", "旗舰店", "专卖店", "尼龙", "背包",
    ],
  },
  {
    category: "transfer",
    keywords: [
      "余额宝", "理财", "基金", "转入", "转出", "还款", "信用卡还款", "花呗",
      "借呗", "白条", "零钱通", "提现", "充值",
    ],
  },
  {
    category: "income",
    keywords: [
      "工资", "薪资", "奖学金", "兼职", "稿费", "劳务", "退款", "退货", "报销",
      "利息", "分红", "奖金", "补贴", "助学金", "家教",
    ],
  },
];

/** 订阅特征词（用于 isSubscription 判定，独立于分类） */
const SUBSCRIPTION_HINTS = [
  "会员", "vip", "订阅", "续费", "大会员", "超级会员",
  "app store", "icloud", "网易云", "qq音乐", "爱奇艺", "腾讯视频", "优酷",
  "哔哩哔哩", "bilibili", "芒果tv", "百度网盘", "wps", "剪映", "chatgpt",
  "claude", "notion", "喜马拉雅", "keep", "校园网", "宽带", "流量套餐",
];

/** 归一化文本用于匹配：小写、去掉常见分隔符 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]/g, "")
    .replace(/[·•\-—_\/(),，。:："'`]/g, "");
}

/**
 * 对一笔支出/收入做分类。
 * @param direction 资金方向；in 直接归为收入，不再走关键词
 * @param merchant 交易对方（优先）
 * @param detail 商品说明/备注（补充）
 * @param rawType 账单原始「交易类型」，如「转账」「退款」
 */
export function classify(
  direction: "out" | "in",
  merchant: string,
  detail: string,
  rawType: string,
): CategoryKey {
  if (direction === "in") return "income";

  const haystack = normalizeForMatch([merchant, detail, rawType].filter(Boolean).join(" "));

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(normalizeForMatch(kw))) {
        return rule.category;
      }
    }
  }
  return "other";
}

/** 判定是否订阅/自动续费类支出 */
export function looksLikeSubscription(merchant: string, detail: string): boolean {
  const haystack = normalizeForMatch(merchant + " " + detail);
  return SUBSCRIPTION_HINTS.some((kw) => haystack.includes(normalizeForMatch(kw)));
}

/** 分类标签（展示用） */
export function categoryLabel(key: CategoryKey): string {
  return CATEGORIES[key].label;
}
