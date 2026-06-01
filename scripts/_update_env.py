import pathlib
p = pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env')
lines = p.read_text(encoding='utf-8').splitlines()
insert = [
'# ── Agent Chat / Runtime ──',
'AGENT_CHAT_MODE=auto',
'LLM_PROVIDER_PRIORITY=auto',
'',
'# ── DeepSeek（可选）──',
'DEEPSEEK_API_KEY=',
'DEEPSEEK_BASE_URL=https://api.deepseek.com',
'DEEPSEEK_FLASH_MODEL=',
'DEEPSEEK_PRO_MODEL=',
'',
'# ── Moonshot（可选）──',
'MOONSHOT_API_KEY=',
'MOONSHOT_BASE_URL=https://api.moonshot.cn/v1',
'MOONSHOT_FLASH_MODEL=',
'MOONSHOT_PRO_MODEL=',
'',
'# ── Groq（可选）──',
'GROQ_API_KEY=',
'GROQ_BASE_URL=https://api.groq.com/openai/v1',
'GROQ_FLASH_MODEL=',
'GROQ_PRO_MODEL=',
'',
'# ── Gemini（可选）──',
'GEMINI_API_KEY=',
'GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai',
'GEMINI_FLASH_MODEL=',
'GEMINI_PRO_MODEL=',
]
for idx, line in enumerate(lines):
  if line.startswith('LLM_TIMEOUT_MS='):
    lines[idx+1:idx+1] = insert
    break
else:
  lines.extend(insert)
p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('UPDATED_ENV')
