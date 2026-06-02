 = Get-Content 'E:\code\javascript\project\PlanningGo\src\server\modules\agent\modelClient.ts' -Raw
 = .Replace('env.MIMO_FLASH_MODEL ?? \ mimo-7b\', 'env.MIMO_FLASH_MODEL ?? \mimo-v2.5-pro\')
 = .Replace('env.MIMO_PRO_MODEL ?? \mimo-7b\', 'env.MIMO_PRO_MODEL ?? \mimo-v2.5-pro\')
[System.IO.File]::WriteAllText('E:\code\javascript\project\PlanningGo\src\server\modules\agent\modelClient.ts', )
Write-Output 'modelClient done'
