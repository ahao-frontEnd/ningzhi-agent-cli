/**
 * 将时间戳格式化为相对时间的中文描述（如"刚刚"、"5分钟内"、"3小时前"）
 * @param ts ISO 格式的时间字符串
 */
export function formatRelativeTime(ts: string): string {
  // 计算与当前时间的时间差，单位是毫秒
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000); // 差值换算为分钟
  const diffHour = Math.floor(diffMin / 60); // 分钟换算为小时
  const diffDay = Math.floor(diffHour / 24); // 小时换算为天数

  // 按时间区间从小到大返回对应的描述文案
  if (diffMin < 1) return "刚刚";
  if (diffMin < 5) return "1分钟内";
  if (diffMin < 10) return "5分钟内";
  if (diffMin < 30) return "10分钟内";
  if (diffMin < 60) return "30分钟内";
  if (diffHour < 2) return "1小时内";
  if (diffHour < 24) return `${diffHour}小时内`;
  if (diffDay < 2) return "1天前";
  return `${diffDay}天前`;
}

/**
 * 截断超长字符串，超出部分以"..."结尾
 * @param str 原始字符串（为空时返回占位符"-"）
 * @param maxLen 最大保留长度
 */
export function truncate(str: string | null, maxLen: number): string {
  if (!str) return "-";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}
