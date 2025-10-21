import { useState, useEffect, useRef, useCallback } from 'react';

// Define the interface for the SpeechRecognition API which might be prefixed.
interface ISpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
    onend: ((this: ISpeechRecognition, ev: Event) => any) | null;
}

// Define the constructor for the SpeechRecognition API.
interface SpeechRecognitionStatic {
    new(): ISpeechRecognition;
}

// Define the custom event types.
interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

// Check for the prefixed version of the API.
declare global {
    interface Window {
        SpeechRecognition: SpeechRecognitionStatic;
        webkitSpeechRecognition: SpeechRecognitionStatic;
    }
}


interface SpeechRecognitionHook {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
  isSupported: boolean;
}

const SpeechRecognitionAPI = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const useSpeechRecognition = (): SpeechRecognitionHook => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>(''); // Ref to store the stable, final parts of the transcript.

  useEffect(() => {
    if (!SpeechRecognitionAPI) {
      console.warn('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      // Iterate only over the new results since the last event.
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const currentTranscriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          // If the result is final, "commit" it by appending it to our stable ref.
          // We also add a space to separate phrases.
          finalTranscriptRef.current += currentTranscriptPart + ' ';
        } else {
          // Otherwise, it's part of the current ongoing (interim) speech.
          interimTranscript += currentTranscriptPart;
        }
      }
      // The displayed transcript is the stable final part plus the current live interim part.
      // This prevents the UI from "jumping" or erasing text.
      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech Recognition Error:', event.error, event.message);
      setError(event.error === 'no-speech' ? 'No speech was detected.' : event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
        }
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      // Reset transcripts when starting a new listening session.
      setTranscript('');
      finalTranscriptRef.current = ''; 
      setError(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        // This can happen if the mic is already in use or permissions are denied.
        console.error("Could not start speech recognition:", e);
        setError("Could not start listening. Please check microphone permissions.");
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    error,
    isSupported: !!SpeechRecognitionAPI,
  };
};