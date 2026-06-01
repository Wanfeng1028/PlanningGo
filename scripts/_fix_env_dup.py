import pathlib
p = pathlib.Path(r'E:\code\javascript\project\PlanningGo\src\server\config\env.ts')
c = p.read_text(encoding='utf-8')
c = c.replace('  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),\n  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),', '  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),')
p.write_text(c, encoding='utf-8')
print('FIXED_ENV')
