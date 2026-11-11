"""Local CPU ASR. Uploaded recordings never leave the server."""
import array, json, math, os, wave
from pathlib import Path

def transcribe(source, run):
    info=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)]))
    raw_duration=info.get('format',{}).get('duration')
    if not any(s.get('codec_type')=='audio' for s in info.get('streams',[])):raise RuntimeError('audio_duration_limit')
    if raw_duration is not None and not 0<float(raw_duration)<=3600:raise RuntimeError('audio_duration_limit')
    # Browser WebM recordings may omit duration; the bounded decode below measures actual frames.
    wav=source.parent/'normalized.wav';output=source.parent/'transcript'
    run(['ffmpeg','-nostdin','-v','error','-i',str(source),'-map','0:a:0','-vn','-t','3601','-ar','16000','-ac','1','-c:a','pcm_s16le',str(wav)],60)
    with wave.open(str(wav)) as audio:
        if audio.getnframes()/audio.getframerate()>3600:raise RuntimeError('audio_duration_limit')
        samples=array.array('h',audio.readframes(audio.getnframes()))
        if not samples or math.sqrt(sum(x*x for x in samples)/len(samples))<40:raise RuntimeError('no_readable_text')
    run([os.environ.get('ASR_WHISPER_BIN','/usr/local/bin/whisper-cli'),'-m',os.environ.get('ASR_MODEL_PATH','/opt/fundapp-asr/ggml-small-q5_1.bin'),'-f',str(wav),'-l','auto','-t','4','-ng','-np','-oj','-of',str(output)],3500)
    if output.with_suffix('.json').stat().st_size>8*1024*1024:raise RuntimeError('extraction_limit')
    result=json.loads(output.with_suffix('.json').read_text())
    pages=[]
    for segment in result.get('transcription',[]):
        text=segment.get('text','').strip()
        if not text or text.startswith('[') or text.startswith('('):continue
        start=segment['offsets']['from']//1000; end=segment['offsets']['to']//1000
        stamp=lambda s:f'{s//60:02d}:{s%60:02d}'
        pages.append({'page':len(pages)+1,'text':f'录音 {stamp(start)}–{stamp(end)} '+text,'method':'local_audio_transcription'})
    return pages
