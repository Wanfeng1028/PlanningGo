import pathlib, re
files = [
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.example'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.production.template'),
]
groups = {
  'agent': ['# ── Agent Chat / Runtime ──','AGENT_CHAT_MODE=auto','LLM_PROVIDER_PRIORITY=auto'],
  'deepseek': ['# ── DeepSeek（可选）──','DEEPSEEK_API_KEY=','DEEPSEEK_BASE_URL=https://api.deepseek.com','DEEPSEEK_FLASH_MODEL=','DEEPSEEK_PRO_MODEL='],
  'moonshot': ['# ── Moonshot（可选）──','MOONSHOT_API_KEY=','MOONSHOT_BASE_URL=https://api.moonshot.cn/v1','MOONSHOT_FLASH_MODEL=','MOONSHOT_PRO_MODEL='],
  'groq': ['# ── Groq（可选）──','GROQ_API_KEY=','GROQ_BASE_URL=https://api.groq.com/openai/v1','GROQ_FLASH_MODEL=','GROQ_PRO_MODEL='],
  'gemini': ['# ── Gemini（可选）──','GEMINI_API_KEY=','GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai','GEMINI_FLASH_MODEL=','GEMINI_PRO_MODEL='],
}
order = ['agent','deepseek','moonshot','groq','gemini']
new_keys = set()
for g in order:
  for line in groups[g]:
    if '=' in line and not line.startswith('#'):
      new_keys.add(line.split('=',1)[0])
for f in files:
  lines = f.read_text(encoding='utf-8').splitlines()
  filtered=[]
  for line in lines:
    key = line.split('=',1)[0].strip() if '=' in line else None
    if key and key in new_keys:
      continue
    # drop comment lines for these groups that are repeated
    if line.startswith('#') and any(line.strip().startswith(prefix) for prefix in ['# ── Agent Chat','# ── DeepSeek','# ── Moonshot','# ── Groq','# ── Gemini']):
      continue
    filtered.append(line)
  # insert after LLM_TIMEOUT_MS=
  out=[]
  inserted=False
  for line in filtered:
    out.append(line)
    if line.startswith('LLM_TIMEOUT_MS=') and not inserted:
      for g in order:
        out.extend(groups[g])
        out.append('')
      inserted=True
  if not inserted:
    for g in order:
      out.extend(groups[g])
      out.append('')
  text='\n'.join(out)
  # remove excessive blank lines
  text=re.sub(r'\n{3,}', '\n\n', text)
  f.write_text(text + '\n', encoding='utf-8')
print('REBUILT_ENV')
