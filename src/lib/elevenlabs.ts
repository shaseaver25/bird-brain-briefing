const BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export async function textToSpeech(text: string, voiceId: string, apiKey?: string): Promise<HTMLAudioElement | null> {
  const key = apiKey || import.meta.env.VITE_ELEVENLABS_API_KEY;
  if (!key) {
    console.warn("ElevenLabs API key not set");
    return null;
  }

  const response = await fetch(
    `${BASE_URL}/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
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
  return new Audio(audioUrl);
}
