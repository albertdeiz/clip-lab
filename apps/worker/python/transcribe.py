#!/usr/bin/env python3
"""Transcribe un archivo de audio con faster-whisper y emite JSON word-level.

Uso: python3 transcribe.py <audio_path> <model_name>
Salida (stdout): {"language": str, "text": str, "words": [{"w","start","end"}]}
"""
import sys
import json


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"error": "uso: transcribe.py <audio> <model>"}))
        sys.exit(2)

    audio_path = sys.argv[1]
    model_name = sys.argv[2]

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper no instalado (pip install faster-whisper)"}))
        sys.exit(3)

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, word_timestamps=True)

    words = []
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text)
        for w in (seg.words or []):
            words.append(
                {
                    "w": w.word,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                }
            )

    print(
        json.dumps(
            {
                "language": info.language,
                "text": "".join(text_parts).strip(),
                "words": words,
            }
        )
    )


if __name__ == "__main__":
    main()
