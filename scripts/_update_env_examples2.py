import pathlib
for file in [
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.example'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.production.template'),
]:
  lines = file.read_text(encoding='utf-8').splitlines()
  needed = {
'AGENT_CHAT_MODE':'auto',
'LLM_PROVIDER_PRIORITY':'auto',
'DEEPSEEK_API_KEY':'',
'DEEPSEEK_BASE_URL':'https://api.deepseek.com',
'DEEPSEEK_FLASH_MODEL':'',
'DEEPSEEK_PRO_MODEL':'',
'MOONSHOT_API_KEY':'',
'MOONSHOT_BASE_URL':'https://api.moonshot.cn/v1',
'MOONSHOT_FLASH_MODEL':'',
'MOONSHOT_PRO_MODEL':'',
'GROQ_API_KEY':'',
'GROQ_BASE_URL':'https://api.groq.com/openai/v1',
'GROQ_FLASH_MODEL':'',
'GROQ_PRO_MODEL':'',
'GEMINI_API_KEY':'',
'GEMINI_BASE_URL':'https://generativelanguage.googleapis.com/v1beta/openai',
'GEMINI_FLASH_MODEL':'',
'GEMINI_PRO_MODEL':'',
  }
  existing = set()
  for line in lines:
    if '=' in line:
      existing.add(line.split('=',1)[0].strip())
  insert = []
  for k,v in needed.items():
    if k not in existing:
      insert.append(f'{k}={v}')
  if insert:
    for idx,line in enumerate(lines):
      if line.startswith('LLM_TIMEOUT_MS='):
        lines[idx+1:idx+1] = insert
        break
    else:
      lines.extend(insert)
  file.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('UPDATED_EXAMPLES')
