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

export function speakText(
  text: string,
  dialect: DialectCode,
  onStart?: () => void,
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const config = DIALECT_CONFIG[dialect];
  utterance.lang = config.bcp47;
  utterance.rate = 0.96;

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith(config.bcp47.toLowerCase())) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(dialect));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export interface SpeechRecognitionHandle {
  stop: () => void;
}

/**
 * Starts real browser microphone speech-to-text recognition.
 */
export function startVoiceRecognition(params: {
  dialect: DialectCode;
  onResult: (transcript: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): SpeechRecognitionHandle | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };

  const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!RecognitionCtor) {
    params.onError(
      'Voice microphone recognition requires Chrome, Edge, or Safari. Please type your question below.'
    );
    params.onEnd();
    return null;
  }

  const recognition = new RecognitionCtor();
  recognition.lang = DIALECT_CONFIG[params.dialect].bcp47;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) {
      params.onResult(transcript);
    }
  };

  recognition.onerror = (event: any) => {
    const errCode = event?.error || 'unknown';
    if (errCode === 'not-allowed') {
      params.onError('Microphone permission denied. Please allow microphone access in browser settings.');
    } else if (errCode !== 'aborted') {
      params.onError(`Voice recognition error (${errCode}). You can also type your question.`);
    }
    params.onEnd();
  };

  recognition.onend = () => {
    params.onEnd();
  };

  try {
    recognition.start();
    return { stop: () => recognition.stop() };
  } catch {
    params.onError('Could not access microphone right now.');
    params.onEnd();
    return null;
  }
}

