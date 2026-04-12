const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;

export async function textToSpeech(text: string, voiceId: string): Promise<HTMLAudioElement | null> {
  if (!API_KEY) {
    console.warn("ElevenLabs API key not set");
    return null;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("TTS failed:", response.status);
    return null;
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  return audio;
}
