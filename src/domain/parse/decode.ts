/**
 * 账单文件解码
 * ------------------------------------------------------------------
 * 真实场景：支付宝导出是 UTF-8 with BOM，微信导出常是 GBK，银行导出的
 * 「明细.csv」甚至是 GB18030 + 制表符。这里用「严格解码 + 逐级降级」：
 *   UTF-8(fatal) → UTF-16LE(BOM) → GB18030 → UTF-8(宽松兜底)
 * fatal 解码器遇到非法字节会抛错，正因为会抛错，才能判断编码而不是猜。
 */

export interface DecodedText {
  text: string;
  encoding: string;
}

export function decodeBillBuffer(input: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.length === 0) return { text: "", encoding: "empty" };

  // 1) BOM 优先
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, ""), encoding: "utf-8-bom" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" };
  }

  // 2) 严格 UTF-8
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    /* 落到下一步 */
  }

  // 3) GB18030（覆盖 GBK/GB2312，微信与多数国内银行账单）
  try {
    const text = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
    return { text, encoding: "gb18030" };
  } catch {
    /* 落到兜底 */
  }

  // 4) 兜底：宽松 UTF-8，宁可个别字符乱码也不整份失败
  return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8-lenient" };
}
