import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  FeaturePopover,
  PopoverItem,
} from "../../components/FeatureModal";
import { MAX_INPUT_CHARS, MAX_INPUT_TOKENS, validateInputLength } from "../../lib/tokens";
import { WorkspaceModal } from "../../components/WorkspaceModal";
import type { ModalKey, SessionUser } from "../../types";
import type {
  AttachmentItem,
  ModelMode,
  VoiceState,
  SpeechRecognitionInstance,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "./types";
import { MODEL_MODES } from "./types";
import { CITY_DISTRICTS, CITY_LIST } from "./constants";
import styles from "../../pages/FeaturesPage.module.scss";

/* ── Composer (Like-style slim capsule) ── */
export interface ComposerProps {
  compact?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (attachments: AttachmentItem[]) => void;
  disabled?: boolean;
  placeholder?: string;
  showMeta?: boolean;
  user?: SessionUser | null;
  city?: string;
  onCityChange?: (city: string) => void;
  onOpenModal?: (key: ModalKey) => void;
  modelMode: ModelMode;
  onModelModeChange: (mode: ModelMode) => void;
  onToast?: (text: string, type?: "success" | "error" | "info") => void;
}

export function Composer({
  compact,
  textareaRef,
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  showMeta,
  user,
  city,
  onCityChange,
  onOpenModal,
  modelMode,
  onModelModeChange,
  onToast,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const valueRef = useRef(value);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  // Popover states
  const [plusOpen, setPlusOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityStep, setCityStep] = useState<"city" | "district">("city");
  const [selectedCityName, setSelectedCityName] = useState<string>("");
  const inputValidation = useMemo(() => validateInputLength(value), [value]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /* ── Auto-resize textarea as content grows/shrinks ── */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, textareaRef]);

  /* ── Cleanup preview URLs on unmount ── */
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, []);

  /* ── File pick handler ── */
  const handleFilePick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newItems: AttachmentItem[] = [];
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        newItems.push({
          id: uuid(),
          file,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        });
      }

      setAttachments((prev) => {
        const next = [...prev, ...newItems];
        if (next.length > 9) {
          return next.slice(0, 9);
        }
        return next;
      });

      e.target.value = "";
    },
    [],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  /* ── Plus menu actions ── */
  const PLUS_ITEMS = [
    { icon: "📍", label: "添加地点", desc: "输入出发地或目的地", action: "location" as const },
    { icon: "🖼", label: "添加图片", desc: "图片识别稍后开放", action: "image" as const },
    { icon: "⚙", label: "添加偏好", desc: "少排队、室内优先等", action: "preference" as const },
    { icon: "👥", label: "添加同行人", desc: "家人、朋友、情侣、独自", action: "companion" as const },
    { icon: "💰", label: "添加预算", desc: "人均消费范围", action: "budget" as const },
  ];

  const handlePlusAction = useCallback((action: string) => {
    setPlusOpen(false);
    switch (action) {
      case "location":
        onChange(value ? `${value}\n出发地：` : "出发地：");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
      case "image":
        handleFilePick();
        break;
      case "preference":
        onChange(value ? `${value}\n偏好：少排队、少走路、室内优先` : "偏好：少排队、少走路、室内优先");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
      case "companion":
        setCompanionOpen(true);
        break;
      case "budget":
        onChange(value ? `${value}\n预算：人均 200` : "预算：人均 200");
        requestAnimationFrame(() => textareaRef.current?.focus());
        break;
    }
  }, [value, onChange, textareaRef, handleFilePick]);

  const COMPANION_OPTIONS = [
    { value: "家人", icon: "👨‍👩‍👧‍👦", label: "家庭出行" },
    { value: "朋友", icon: "👥", label: "朋友聚会" },
    { value: "情侣", icon: "💑", label: "情侣约会" },
    { value: "独自", icon: "🚶", label: "独自出行" },
  ];

  const handleCompanionSelect = useCallback((companion: string) => {
    setCompanionOpen(false);
    onChange(value ? `${value}\n同行人：${companion}` : `同行人：${companion}`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [value, onChange, textareaRef]);

  /* ── Voice recording ── */
  const SpeechRecognitionCtor = useMemo(() => {
    const w = window as unknown as Record<string, unknown>;
    return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionInstance) | null;
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (!SpeechRecognitionCtor) {
      setVoiceState("not-supported");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    let hasResult = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      hasResult = true;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      const combined = (valueRef.current ? valueRef.current : "") + finalTranscript + interim;
      onChange(combined);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      recognitionRef.current = null;

      switch (event.error) {
        case "not-allowed":
          setVoiceState("not-allowed");
          break;
        case "no-speech":
          if (!hasResult) setVoiceState("no-speech");
          break;
        case "audio-capture":
          setVoiceState("error");
          break;
        case "network":
          setVoiceState("error");
          break;
        case "aborted":
          break;
        default:
          setVoiceState("error");
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (hasResult) {
        setVoiceState("processing");
        setTimeout(() => {
          setVoiceState("idle");
          requestAnimationFrame(() => textareaRef.current?.focus());
        }, 600);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setVoiceState("listening");
  }, [isRecording, SpeechRecognitionCtor, onChange, textareaRef]);

  /* ── Mode select ── */
  const handleModeSelect = useCallback((mode: ModelMode) => {
    onModelModeChange(mode);
    setModeOpen(false);
    onToast?.(`已切换到 ${mode} 模式`, "info");
  }, [onModelModeChange, onToast]);

  /* ── Submit ── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (disabled) return;
    onSubmit(attachments);
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  };

  const fileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return null;
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word") || file.name.endsWith(".doc") || file.name.endsWith(".docx")) return "📝";
    if (file.type.includes("sheet") || file.name.endsWith(".xls") || file.name.endsWith(".xlsx")) return "📊";
    return "📎";
  };

  const voicePanelData = useMemo(() => {
    switch (voiceState) {
      case "listening":
        return { title: "正在听你说…", desc: "说出时间、预算、同行人和想去的方向", showStop: true, showRetry: false, showClose: false };
      case "no-speech":
        return { title: "没有听到内容", desc: "可以再试一次，或者直接打字输入", showStop: false, showRetry: true, showClose: true };
      case "not-allowed":
        return { title: "麦克风权限未开启", desc: "请在浏览器地址栏允许麦克风权限后重试", showStop: false, showRetry: false, showClose: true };
      case "not-supported":
        return { title: "当前浏览器不支持语音输入", desc: "可以直接用文字描述你的周末需求", showStop: false, showRetry: false, showClose: true };
      case "processing":
        return { title: "正在整理语音…", desc: "我会把识别内容填入输入框", showStop: false, showRetry: false, showClose: false };
      case "error":
        return { title: "语音服务暂时不可用", desc: "可以稍后重试，或者直接打字描述", showStop: false, showRetry: true, showClose: true };
      default:
        return null;
    }
  }, [voiceState]);

  return (
    <div
      className={`${styles.featureComposer} ${compact ? styles.featureComposerCompact : ""}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />

      {attachments.length > 0 && (
        <div className={styles.composerAttachments}>
          {attachments.map((att) => (
            <div key={att.id} className={styles.composerAttachmentThumb}>
              {att.previewUrl ? (
                <img src={att.previewUrl} alt={att.file.name} />
              ) : (
                <span className={styles.attachmentFileIcon}>
                  {fileIcon(att.file)}
                </span>
              )}
              <button
                className={styles.composerAttachmentRemove}
                type="button"
                aria-label={`移除 ${att.file.name}`}
                onClick={() => handleRemoveAttachment(att.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.composerInputRow}>
        {/* Plus button with popover menu */}
        <div className={styles.composerPopoverWrap}>
          <button
            className={styles.composerIconButton}
            type="button"
            aria-label="添加内容"
            onClick={() => setPlusOpen((v) => !v)}
            disabled={disabled}
          >
            +
          </button>
          <FeaturePopover open={plusOpen} onClose={() => setPlusOpen(false)}>
            {PLUS_ITEMS.map((item) => (
              <PopoverItem
                key={item.action}
                icon={item.icon}
                label={item.label}
                desc={item.desc}
                onClick={() => handlePlusAction(item.action)}
              />
            ))}
          </FeaturePopover>
        </div>

        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          placeholder={placeholder || "明天带娃半天，预算 300，想玩点不一样的…"}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next.length <= MAX_INPUT_CHARS ? next : next.slice(0, MAX_INPUT_CHARS));
          }}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        {/* Model mode selector with popover */}
        <div className={styles.composerPopoverWrap}>
          <button
            className={styles.composerModeButton}
            type="button"
            onClick={() => setModeOpen((v) => !v)}
          >
            {modelMode}
          </button>
          <FeaturePopover open={modeOpen} onClose={() => setModeOpen(false)}>
            <PopoverItem
              label="Flash"
              desc="快速规划，适合普通周末路线"
              check={modelMode === "Flash"}
              onClick={() => handleModeSelect("Flash")}
            />
            <PopoverItem
              label="Pro"
              desc="复杂约束，多人偏好、天气、排队综合推理"
              check={modelMode === "Pro"}
              onClick={() => handleModeSelect("Pro")}
            />
          </FeaturePopover>
        </div>

        <button
          className={`${styles.composerIconButton} ${isRecording ? styles.composerVoiceActive : ""}`}
          type="button"
          aria-label={isRecording ? "停止录音" : "语音输入"}
          onClick={toggleRecording}
          disabled={disabled && !isRecording}
        >
          {isRecording ? <span className={styles.voiceDot} /> : "🎙"}
        </button>

        <button
          className={styles.composerSendButton}
          type="button"
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          onClick={handleSubmit}
        >
          发送
        </button>
      </div>

      <div className={styles.composerLimitRow}>
        <span
          className={`${styles.composerLimitItem} ${!inputValidation.valid ? styles.composerLimitExceeded : ""}`}
        >
          {inputValidation.charCount}/{MAX_INPUT_CHARS} 字符
        </span>
        <span
          className={`${styles.composerLimitItem} ${!inputValidation.valid ? styles.composerLimitExceeded : ""}`}
        >
          约 {inputValidation.tokenCount}/{MAX_INPUT_TOKENS} tokens
        </span>
      </div>

      {showMeta && (
        <div className={styles.composerMetaRow}>
          <button
            className={styles.composerMetaCity}
            onClick={() => { setCityOpen(true); setCityStep("city"); setSelectedCityName(""); }}
            title="选择城市和地区"
          >
            📍 {city}
          </button>
          {user ? (
            <span className={styles.composerMetaItem}>
              👤 {user.name || "已登录"}
            </span>
          ) : (
            <button
              className={styles.composerMetaLink}
              onClick={() => onOpenModal?.("login")}
            >
              登录解锁更多
            </button>
          )}
          <span className={styles.composerMetaItem}></span>

          {/* City Selector Modal */}
          <WorkspaceModal
            open={cityOpen}
            onClose={() => setCityOpen(false)}
            title={cityStep === "city" ? "选择城市" : `选择区域 — ${selectedCityName}`}
            subtitle="用于规划路线、天气和附近地点"
            width="sm"
          >
            {cityStep === "city" ? (
              <div className={styles.cityGrid}>
                {CITY_LIST.map((c) => (
                  <button
                    key={c}
                    className={styles.cityGridItem}
                    onClick={() => {
                      setSelectedCityName(c);
                      const districts = CITY_DISTRICTS[c];
                      if (districts && districts.length > 0) {
                        setCityStep("district");
                      } else {
                        onCityChange?.(c);
                        setCityOpen(false);
                      }
                    }}
                  >
                    {c.replace("市", "")}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.cityGrid}>
                <button
                  className={`${styles.cityGridItem} ${styles.cityGridItemBack}`}
                  onClick={() => setCityStep("city")}
                >
                  ← 返回选择城市
                </button>
                <button
                  className={styles.cityGridItem}
                  onClick={() => {
                    onCityChange?.(selectedCityName);
                    setCityOpen(false);
                  }}
                >
                  {selectedCityName.replace("市", "")}（全市）
                </button>
                {CITY_DISTRICTS[selectedCityName]?.map((d) => (
                  <button
                    key={d}
                    className={styles.cityGridItem}
                    onClick={() => {
                      onCityChange?.(`${selectedCityName.replace("市", "")} ${d}`);
                      setCityOpen(false);
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </WorkspaceModal>
        </div>
      )}

      {/* Voice Modal */}
      <WorkspaceModal
        open={!!voicePanelData}
        onClose={() => {
          if (isRecording && recognitionRef.current) recognitionRef.current.stop();
          setVoiceState("idle");
        }}
        title={voicePanelData?.title ?? "语音输入"}
        width="sm"
      >
        <div className={styles.voiceBody}>
          <div className={styles.voiceOrb}>
            {voiceState === "listening" || voiceState === "processing" ? (
              <><span /><span /><span /></>
            ) : voiceState === "no-speech" ? (
              <span className={styles.voiceOrbIcon}>🔇</span>
            ) : voiceState === "not-allowed" ? (
              <span className={styles.voiceOrbIcon}>🚫</span>
            ) : (
              <span className={styles.voiceOrbIcon}>⚠</span>
            )}
          </div>

          {voicePanelData && (
            <>
              <div className={styles.voiceDesc}>{voicePanelData.desc}</div>

              <div className={styles.voiceActions}>
                {voicePanelData.showStop && (
                  <button
                    className={styles.voiceStopBtn}
                    type="button"
                    onClick={() => {
                      if (recognitionRef.current) recognitionRef.current.stop();
                    }}
                  >
                    停止
                  </button>
                )}
                {voicePanelData.showRetry && (
                  <button
                    className={styles.voiceRetryBtn}
                    type="button"
                    onClick={() => {
                      setVoiceState("idle");
                      requestAnimationFrame(() => toggleRecording());
                    }}
                  >
                    再试一次
                  </button>
                )}
                {voicePanelData.showClose && (
                  <button
                    className={styles.voiceCloseTextBtn}
                    type="button"
                    onClick={() => setVoiceState("idle")}
                  >
                    {voiceState === "no-speech" ? "关闭" : "知道了"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </WorkspaceModal>

      {/* Companion Selection Modal */}
      <WorkspaceModal
        open={companionOpen}
        onClose={() => setCompanionOpen(false)}
        title="选择同行人"
        subtitle="帮助 AI 更好地规划适合的路线"
        width="sm"
      >
        <div className={styles.companionGrid}>
          {COMPANION_OPTIONS.map((co) => (
            <button
              key={co.value}
              className={styles.companionOption}
              onClick={() => handleCompanionSelect(co.value)}
            >
              <span className={styles.companionIcon}>{co.icon}</span>
              <span className={styles.companionLabel}>{co.label}</span>
            </button>
          ))}
        </div>
      </WorkspaceModal>
    </div>
  );
}
