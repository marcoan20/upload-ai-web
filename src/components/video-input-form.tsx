import { Label } from "@radix-ui/react-label";
import { Separator } from "@radix-ui/react-separator";
import { FileVideo, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { loadFFmpeg } from "@/lib/ffmpeg";
import { fetchFile } from "@ffmpeg/util"
import { api } from "@/lib/axios";
import { z } from "zod";


type Status = 'waiting' | 'converting' | 'uploading' | 'generationg' | 'success' | 'error';

const statusMessage = {
  waiting: 'Carregar vídeo',
  converting: 'Convertendo vídeo...',
  uploading: 'Enviando vídeo...',
  generationg: 'Gerando transcrição...',
  success: 'Sucesso!',
  error: 'Erro',
}

interface VideoInputFormProps {
  onVideoUploaded: (id: string) => void;
}

export function VideoInputForm(props: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('waiting');
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;
    if (!files) return;

    const selectedFile = files[0];

    setVideoFile(selectedFile);
  }

  async function convertVideoToAudio(video: File) {

    console.info("Convert started");
    const ffmpeg = await loadFFmpeg();

    await ffmpeg.writeFile('input.mp4', await fetchFile(video));

    //ffmpeg.on('log', log => console.log(log.message));
    ffmpeg.on('progress', progress => console.info('Convert progress: ' + Math.round(progress.progress * 100) + "%"));

    await ffmpeg.exec([
      '-i',
      'input.mp4',
      '-map',
      '0:a',
      '-b:a',
      '20K',
      '-acodec',
      'libmp3lame',
      'output.mp3'
    ]);

    const data = await ffmpeg.readFile('output.mp3');

    const audioFileBlob = new Blob([data], { type: 'audio/mpeg' });
    const audioFile = new File([audioFileBlob], 'audio.mp3', { type: 'audio/mpeg' });

    console.info("Convert completed");

    return audioFile;
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!videoFile) return;

    const prompt = promptInputRef.current?.value;

    setStatus('converting');

    const audioFile = await convertVideoToAudio(videoFile);

    const data = new FormData();

    data.append('file', audioFile);

    setStatus('uploading');

    const response = await api.post('/videos', data);

    console.log(response.data)

    const responseSchema = z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      createdAt: z.string(),
      transcription: z.nullable(z.string()),
    });

    setStatus('generationg');

    const { id } = responseSchema.parse(response.data);

    await api.post(`/videos/${id}/transcription`, {
      prompt,
    });

    setStatus('success');

    props.onVideoUploaded(id);
  }

  const previewUrl = useMemo(() => {
    if (!videoFile) return;

    return URL.createObjectURL(videoFile);
  }, [videoFile])

  return (
    <form className="space-y-6" onSubmit={handleUploadVideo} >
      <label
        htmlFor="video"
        className="relative border flex w-full rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/20"
      >
        {videoFile ? (
          <video src={previewUrl} controls={false} className="pointer-events-none absolute inset-0" />
        ) : (
          <>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </>
        )}
      </label>
      <input
        type="file"
        id="video"
        accept="video/mp4"
        className="sr-only"
        onChange={handleFileSelection}
      />

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">
          Prompt de transcrição
        </Label>
        <Textarea
          disabled={status != 'waiting'}
          id="transcription_prompt"
          ref={promptInputRef}
          className="h-20 leading-relaxed p-4 resize-none"
          placeholder="Inclua palavras chaves mencionadas no vídeo separadas por virgulas."
        />
      </div>

      <Button data-success={status == 'success'} disabled={!videoFile || status != 'waiting'} type="submit" className="w-full data-[success=true]:bg-emerald-600">
        {
          status == 'waiting' ? (
            <>
              Carregar vídeo
              <Upload className="w-4 h-4 ml-2" />
            </>
          ) : statusMessage[status]
        }

      </Button>
    </form >
  )
}