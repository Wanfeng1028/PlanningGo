import pathlib
p = pathlib.Path(r'E:\code\javascript\project\PlanningGo\src\server\modules\agent\planner.ts')
c = p.read_text(encoding='utf-8')
old = '''    const candidateList = [
      ...candidates.activities,
      ...candidates.restaurants,
      ...candidates.events,
    ].map((c) => `- ${c.name} (${c.category}, ${c.address}, 璇勫垎${c.rating ?? "?"}, 浜哄潎${c.avgPrice ?? "?"}鍏?`).join("\\n");

    return `鐢ㄦ埛闇€姹傦細
  - 鍩庡競锛?{intent.city}
  - 鍑哄彂鍦帮細${intent.origin.label}
  - 鏃ユ湡锛?{intent.date ?? "鏈??鍏?}
  - 鍑哄彂鏃堕棿锛?{intent.departAt ?? "14:00"}
  - 鍙備笌鑰咃細${intent.participantMode}锛?{intent.partySize}浜?- 鏃堕暱锛?{intent.durationHours[0]}-${intent.durationHours[1]}灏忔椂
  - 棰勭畻涓婇檺锛?{intent.budgetMax ?? "涓嶉檺"}鍏?- 鍋忓ソ锛?{intent.preferences.length > 0 ? intent.preferences.join("銆?) : "鏃犵壒娈婂亸濂?}

  澶╂皵锛?{weather.condition}锛?{weather.temperature}锛?{weather.suggestion}

  鍊欓€夊湴鐐癸細
  ${candidateList || "锛堟棤鍊欓€夊湴鐐癸紝璇锋牴鎹煄甯傚拰闇€姹傛帹鑽愶級"}

  璇疯緭鍑?JSON锛屾牸寮忥細
  ${PLAN_JSON_SCHEMA_DESC}`;'''
new = '''    const candidateList = [
      ...candidates.activities,
      ...candidates.restaurants,
      ...candidates.events,
    ].map((c) => `- ${c.name} (${c.category}, ${c.address}, 评分${c.rating ?? "?"}, 人均${c.avgPrice ?? "?"}元)`).join("\\n");

    return `用户需求：
  - 城市：${intent.city}
  - 出发地：${intent.origin.label}
  - 日期：${intent.date ?? "本周末"}
  - 出发时间：${intent.departAt ?? "14:00"}
  - 参与者：${intent.participantMode}，${intent.partySize}人
  - 时长：${intent.durationHours[0]}-${intent.durationHours[1]}小时
  - 预算上限：${intent.budgetMax ?? "不限"}元
  - 偏好：${intent.preferences.length > 0 ? intent.preferences.join("、") : "无特殊偏好"}

  天气：${weather.condition}，${weather.temperature}，${weather.suggestion}

  候选地点：
  ${candidateList || "（无候选地点，请根据城市和需求推荐）"}

  请输出JSON，格式：
  ${PLAN_JSON_SCHEMA_DESC}`;'''
c = c.replace(old, new)
p.write_text(c, encoding='utf-8')
print('FIXED_PLANNER')
