import pathlib
files = [
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.example'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.production.template'),
]
block = [
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
block_keys = {line.split('=',1)[0]: line for line in block if '=' in line and not line.startswith('#')}

for f in files:
  lines = f.read_text(encoding='utf-8').splitlines()
  # remove duplicates of block keys anywhere
  filtered = []
  for line in lines:
    if '=' in line and line.split('=',1)[0] in block_keys:
      continue
    filtered.append(line)
  # insert after LLM_TIMEOUT_MS
  out = []
  inserted = False
  for line in filtered:
    out.append(line)
    if line.startswith('LLM_TIMEOUT_MS=') and not inserted:
      out.extend(block)
      inserted = True
  if not inserted:
    out.extend(block)
  f.write_text('\n'.join(out) + '\n', encoding='utf-8')
print('UPDATED_ENV')
