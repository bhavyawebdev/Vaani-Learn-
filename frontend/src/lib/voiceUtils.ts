import type { DialectCode } from '../types/workspace';

export const DIALECT_CONFIG: Record<
  DialectCode,
  { label: string; nativeLabel: string; bcp47: string; voiceName: string; sampleText: string }
> = {
  en: {
    label: 'English',
    nativeLabel: 'English',
    bcp47: 'en-IN',
    voiceName: 'Indic English',
    sampleText: 'Acoustic clarity calibrated. Ready for your study session.',
  },
  hi: {
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    bcp47: 'hi-IN',
    voiceName: 'Hindi (हिन्दी)',
    sampleText: 'आपका एआई शिक्षक सुनने के लिए तैयार है।',
  },
  gu: {
    label: 'Gujarati',
    nativeLabel: 'ગુજરાતી',
    bcp47: 'gu-IN',
    voiceName: 'Gujarati (ગુજરાતી)',
    sampleText: 'તમારું અધ્યયન સત્ર શરૂ કરવા માટે તૈયાર છે.',
  },
};

// Active audio state refs (singleton per browser tab so previous audio stops cleanly)
let activeAudioElement: HTMLAudioElement | null = null;
let speechCancelToken = 0;

export function stopSpeaking(): void {
  speechCancelToken += 1;
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement.src = '';
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function pauseSpeaking(): void {
  if (activeAudioElement) {
    activeAudioElement.pause();
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeaking(): void {
  if (activeAudioElement) {
    void activeAudioElement.play();
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.resume();
  }
}

function splitTextIntoSpeechChunks(text: string, maxLen = 180): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const sentences = cleaned.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if ((current + ' ' + s).trim().length <= maxLen) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length <= maxLen) {
        current = s;
      } else {
        // Split very long sentence along commas/spaces
        const words = s.split(' ');
        let part = '';
        for (const w of words) {
          if ((part + ' ' + w).trim().length <= maxLen) {
            part = (part + ' ' + w).trim();
          } else {
            if (part) chunks.push(part);
            part = w;
          }
        }
        current = part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Speaks a complete answer aloud (either via Gnani TTS audioUrl or sequential browser TTS chunks).
 * Never throws; calls onError if playback is unavailable so text remains visible.
 */
export function playTutorAnswer(params: {
  text: string;
  dialect: DialectCode;
  audioUrl?: string | null;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason: string) => void;
}): boolean {
  const { text, dialect, audioUrl, rate = 1.0, onStart, onEnd, onError } = params;
  stopSpeaking();
  const token = speechCancelToken;

  // 1. Prefer Gnani / backend audio if available
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      activeAudioElement = audio;

      audio.onplay = () => {
        if (token === speechCancelToken) onStart?.();
      };
      audio.onended = () => {
        if (token === speechCancelToken) {
          activeAudioElement = null;
          onEnd?.();
        }
      };
      audio.onerror = () => {
        if (token === speechCancelToken) {
          activeAudioElement = null;
          // Fallback seamlessly to browser SpeechSynthesis
          speakWithBrowserChunks(text, dialect, rate, token, onStart, onEnd, onError);
        }
      };

      void audio.play().catch(() => {
        if (token === speechCancelToken) {
          activeAudioElement = null;
          speakWithBrowserChunks(text, dialect, rate, token, onStart, onEnd, onError);
        }
      });
      return true;
    } catch {
      // Fallback below
    }
  }

  return speakWithBrowserChunks(text, dialect, rate, token, onStart, onEnd, onError);
}

function speakWithBrowserChunks(
  text: string,
  dialect: DialectCode,
  rate: number,
  token: number,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (reason: string) => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError?.('Voice playback is not supported in this browser.');
    return false;
  }

  const chunks = splitTextIntoSpeechChunks(text, 180);
  if (!chunks.length) {
    onEnd?.();
    return false;
  }

  const config = DIALECT_CONFIG[dialect];
  const voices = window.speechSynthesis.getVoices();
  const matchedVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith(config.bcp47.toLowerCase())) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(dialect));

  let index = 0;
  let startedNotified = false;

  const speakNext = () => {
    if (token !== speechCancelToken) return;
    if (index >= chunks.length) {
      onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = config.bcp47;
    utterance.rate = rate;
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onstart = () => {
      if (token === speechCancelToken && !startedNotified) {
        startedNotified = true;
        onStart?.();
      }
    };

    utterance.onend = () => {
      if (token !== speechCancelToken) return;
      index += 1;
      speakNext();
    };

    utterance.onerror = (ev) => {
      if (token !== speechCancelToken) return;
      if (ev.error === 'canceled' || ev.error === 'interrupted') return;
      onError?.('Unable to play audio in this browser.');
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  };

  speakNext();
  return true;
}

// Preserved helper for Dashboard voice preview
export function speakText(
  text: string,
  dialect: DialectCode,
  onStart?: () => void,
  onEnd?: () => void
): boolean {
  return playTutorAnswer({ text, dialect, rate: 0.96, onStart, onEnd });
}

export interface RecordedQuestionResult {
  audioBlob: Blob | null;
  mimeType: string;
  bufferedTranscript: string;
}

export interface CompleteQuestionRecorder {
  stopAndFinalize: () => Promise<RecordedQuestionResult>;
  cancel: () => void;
}

const SILENCE_AUTO_STOP_MS = 10_000;

/**
 * Records ONE complete spoken question using MediaRecorder (+ silent buffered SpeechRecognition
 * fallback). Automatically stops after 10 seconds of continuous silence OR when user clicks Stop.
 * Never submits interim fragments.
 */
export async function startCompleteQuestionRecorder(params: {
  dialect: DialectCode;
  onLivePreview?: (previewText: string) => void;
  onSilenceCountdown?: (secondsRemaining: number | null) => void;
  onAutoStop?: () => void;
  onError?: (message: string) => void;
}): Promise<CompleteQuestionRecorder> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error('Microphone recording is not supported in this browser.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      throw new Error(
        'Microphone permission denied. Please allow microphone access in your browser settings.'
      );
    }
    if (err?.name === 'NotFoundError') {
      throw new Error('No microphone was found on your device.');
    }
    throw new Error('Could not access your microphone. Please check device permissions.');
  }

  const audioChunks: BlobPart[] = [];
  const preferredMime =
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

  const mediaRecorder = preferredMime
    ? new MediaRecorder(stream, { mimeType: preferredMime })
    : new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      audioChunks.push(ev.data);
    }
  };

  // Silent continuous SpeechRecognition buffer — accumulates final phrases internally,
  // NEVER submits anything automatically while user is still speaking.
  const win = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

  const finalSegments: string[] = [];
  let latestInterim = '';
  let recognition: any = null;
  let isCancelled = false;
  let isStopping = false;
  let lastActivityAt = Date.now();
  let silenceCheckInterval: number | null = null;
  let audioCtx: AudioContext | null = null;
  let autoStopTriggered = false;

  // Web Audio API RMS monitor to accurately reset 10s timer while user speaks
  try {
    const AudioCtx = win.AudioContext || win.webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      silenceCheckInterval = window.setInterval(() => {
        if (isCancelled || isStopping || autoStopTriggered) return;

        analyser.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        if (rms > 0.02) {
          lastActivityAt = Date.now();
        }

        const silentForMs = Date.now() - lastActivityAt;
        const remainingSec = Math.max(0, Math.ceil((SILENCE_AUTO_STOP_MS - silentForMs) / 1000));

        if (silentForMs >= 3000) {
          params.onSilenceCountdown?.(remainingSec);
        } else {
          params.onSilenceCountdown?.(null);
        }

        if (silentForMs >= SILENCE_AUTO_STOP_MS) {
          autoStopTriggered = true;
          params.onSilenceCountdown?.(0);
          params.onAutoStop?.();
        }
      }, 250);
    }
  } catch {
    // Fallback timer without AudioContext RMS if unavailable
    silenceCheckInterval = window.setInterval(() => {
      if (isCancelled || isStopping || autoStopTriggered) return;
      const silentForMs = Date.now() - lastActivityAt;
      const remainingSec = Math.max(0, Math.ceil((SILENCE_AUTO_STOP_MS - silentForMs) / 1000));
      params.onSilenceCountdown?.(silentForMs >= 3000 ? remainingSec : null);
      if (silentForMs >= SILENCE_AUTO_STOP_MS) {
        autoStopTriggered = true;
        params.onAutoStop?.();
      }
    }, 300);
  }

  if (RecognitionCtor) {
    try {
      recognition = new RecognitionCtor();
      recognition.lang = DIALECT_CONFIG[params.dialect].bcp47;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        if (isCancelled) return;
        lastActivityAt = Date.now();
        params.onSilenceCountdown?.(null);
        let interimBatch = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = (res[0]?.transcript || '').trim();
          if (!text) continue;
          if (res.isFinal) {
            finalSegments.push(text);
          } else {
            interimBatch += (interimBatch ? ' ' : '') + text;
          }
        }
        latestInterim = interimBatch;
        const combinedPreview = [...finalSegments, latestInterim].filter(Boolean).join(' ').trim();
        params.onLivePreview?.(combinedPreview);
      };

      recognition.onerror = (ev: any) => {
        if (ev?.error && ev.error !== 'aborted' && ev.error !== 'no-speech') {
          params.onError?.(`Speech recognition notice: ${ev.error}`);
        }
      };

      // Keep continuous recognition alive across natural pauses until Stop / 10s silence
      recognition.onend = () => {
        if (!isCancelled && !isStopping && mediaRecorder.state === 'recording') {
          try {
            recognition.start();
          } catch {
            // Safe no-op if already stopped
          }
        }
      };

      recognition.start();
    } catch {
      recognition = null;
    }
  }

  mediaRecorder.start(250);

  const cleanupTracks = () => {
    if (silenceCheckInterval !== null) {
      window.clearInterval(silenceCheckInterval);
      silenceCheckInterval = null;
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    stopAndFinalize: () =>
      new Promise<RecordedQuestionResult>((resolve) => {
        isStopping = true;

        const finish = () => {
          cleanupTracks();
          const mimeType = mediaRecorder.mimeType || preferredMime || 'audio/webm';
          const audioBlob = audioChunks.length > 0 ? new Blob(audioChunks, { type: mimeType }) : null;
          const bufferedTranscript = [...finalSegments, latestInterim]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          resolve({ audioBlob, mimeType, bufferedTranscript });
        };

        if (recognition) {
          try {
            recognition.stop();
          } catch {
            // Ignore if already stopped
          }
        }

        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.onstop = () => {
            // Small delay lets final SpeechRecognition result flush cleanly
            setTimeout(finish, 180);
          };
          mediaRecorder.stop();
        } else {
          setTimeout(finish, 100);
        }
      }),

    cancel: () => {
      isCancelled = true;
      isStopping = true;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // Safe no-op
        }
      }
      if (mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {
          // Safe no-op
        }
      }
      cleanupTracks();
    },
  };
}
