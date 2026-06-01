$path='E:\code\javascript\project\PlanningGo\src\server\routes\agentChat.ts'
$content = Get-Content -LiteralPath $path -Encoding utf8 -Raw

$searchImport = @"
import { handleAgentMessage } from "../modules/agent/chatRouter.js";
"@

$replaceImport = @"
import { handleAgentMessage } from "../modules/agent/chatRouter.js";
import { runAgentChatStream } from "../modules/agent/agentRuntime.js";
import { env } from "../config/env.js";
"@

$searchBlock = @"
        let agentResponse: AgentResponse;
        try {
          agentResponse = await handleAgentMessage(
            {
              message: parsed.message,
              city: parsed.city,
              modelMode: parsed.modelMode,
              conversationId: parsed.conversationId,
              selectedOptionId: parsed.selectedOptionId,
            },
            { db, providers: app.providers ?? undefined, userId, log: app.log },
          );
        } finally {
          clearInterval(heartbeat);
        }

        if (clientDisconnected) {
          app.log.warn("[agentChat] Client disconnected, skipping response");
          return;
        }

        // Stream the content text character by character for progressive display
        const content = agentResponse.content;
        for (let i = 0; i < content.length; i++) {
          if (clientDisconnected) break;
          reply.raw.write(`data: ${JSON.stringify({ content: content[i] })}\n\n`);
          // Small delay for streaming effect (skip for short texts)
          if (content.length > 20) {
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
        }

        if (!clientDisconnected) {
          // Final result with full AgentResponse
          reply.raw.write(`data: [FINAL_RESULT]${JSON.stringify(agentResponse)}\n\n`);
          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
        }
"@

$replaceBlock = @"
        function hasAnyLlmKey(): boolean {
          return Boolean(
            env.OPENAI_API_KEY ||
            env.QWEN_API_KEY ||
            env.DEEPSEEK_API_KEY ||
            env.MOONSHOT_API_KEY ||
            env.GROQ_API_KEY ||
            env.GEMINI_API_KEY
          );
        }

        let agentResponse: AgentResponse | null = null;
        try {
          const canUseRuntime = env.AGENT_CHAT_MODE !== 'rule' && (env.AGENT_CHAT_MODE === 'llm' || hasAnyLlmKey());

          if (canUseRuntime) {
            try {
              agentResponse = await runAgentChatStream(
                {
                  message: parsed.message,
                  city: parsed.city,
                  modelMode: parsed.modelMode ?? 'flash',
                  conversationId: parsed.conversationId,
                  selectedOptionId: parsed.selectedOptionId,
                },
                { db, providers: app.providers ?? undefined, userId, log: app.log },
                {
                  writeText: (delta) => {
                    if (!clientDisconnected) reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                  },
                },
              );
            } catch (runtimeErr) {
              app.log.warn({ err: runtimeErr }, '[agentChat] runtime failed, fallback to rule router');
              agentResponse = null;
            }
          }

          if (!agentResponse) {
            agentResponse = await handleAgentMessage(
              {
                message: parsed.message,
                city: parsed.city,
                modelMode: parsed.modelMode,
                conversationId: parsed.conversationId,
                selectedOptionId: parsed.selectedOptionId,
              },
              { db, providers: app.providers ?? undefined, userId, log: app.log },
            );

            const content = agentResponse.content;
            for (let i = 0; i < content.length; i++) {
              if (clientDisconnected) break;
              reply.raw.write(`data: ${JSON.stringify({ content: content[i] })}\n\n`);
              if (content.length > 20) {
                await new Promise((resolve) => setTimeout(resolve, 8));
              }
            }
          }
        } finally {
          clearInterval(heartbeat);
        }

        if (clientDisconnected) {
          app.log.warn('[agentChat] Client disconnected, skipping response');
          return;
        }

        if (agentResponse) {
          reply.raw.write(`data: [FINAL_RESULT]${JSON.stringify(agentResponse)}\n\n`);
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
"@

$content = $content.Replace($searchImport, $replaceImport)
$content = $content.Replace($searchBlock, $replaceBlock)
Set-Content -LiteralPath $path -Value $content -Encoding utf8
'UPDATED_AGENT_CHAT'
