import { useState } from "react"
import { Image as ImageIcon, FileVideo, Upload as UploadIcon } from "lucide-react"
import ImageUploadContent from "./ImageUpload"
import VideoUploadContent from "./VideoUpload"

export default function Upload() {
    const [mode, setMode] = useState('image')

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header with Tab Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                            <UploadIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Upload & Deteksi</h1>
                            <p className="text-muted-foreground text-sm">
                                Upload gambar atau video untuk mendeteksi kelengkapan APD menggunakan YOLOv11.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex rounded-xl bg-muted p-1 self-start sm:self-auto">
                    <button
                        onClick={() => setMode('image')}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                            ${mode === 'image'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'}
                        `}
                    >
                        <ImageIcon className="w-4 h-4" />
                        Gambar
                    </button>
                    <button
                        onClick={() => setMode('video')}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                            ${mode === 'video'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'}
                        `}
                    >
                        <FileVideo className="w-4 h-4" />
                        Video
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="animate-in fade-in duration-300" key={mode}>
                {mode === 'image' ? <ImageUploadContent /> : <VideoUploadContent />}
            </div>
        </div>
    )
}
