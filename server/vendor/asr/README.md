# Local transcription runtime

Pinned whisper.cpp v1.9.5 source (MIT): https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.5
SHA256 whisper-v1.9.5.tar.gz: ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720

Multilingual small q5_1 model (MIT): https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1
SHA256 ggml-small-q5_1.bin: ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb

Both files are included so image builds never fetch mutable model or source artifacts.
The final image runs transcription offline on CPU, one recording at a time.
