import pathlib
for file in [
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.example'),
  pathlib.Path(r'E:\code\javascript\project\PlanningGo\.env.production.template'),
]:
  lines = file.read_text(encoding='utf-8').splitlines()
  seen = set()
  out = []
  for line in lines:
    key = line.split('=',1)[0].strip() if '=' in line else None
    if key and key in seen:
      continue
    if key:
      seen.add(key)
    out.append(line)
  file.write_text('\n'.join(out) + '\n', encoding='utf-8')
print('DEDUPED_ENV')
