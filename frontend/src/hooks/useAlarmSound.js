import { useRef, useState, useCallback, useEffect } from "react"

/**
 * useAlarmSound — Web Audio API siren generator.
 * Generates oscillating siren tone (no MP3 file needed).
 * Polls backend /api/alarm/status and plays sound when active.
 */
export function useAlarmSound(apiBase = "http://localhost:8000", enabled = true) {
    const audioCtxRef = useRef(null)
    const oscillatorRef = useRef(null)
    const gainRef = useRef(null)
    const lfoRef = useRef(null)
    const intervalRef = useRef(null)
    const [isPlaying, setIsPlaying] = useState(false)

    const stopSound = useCallback(() => {
        if (oscillatorRef.current) {
            try { oscillatorRef.current.stop() } catch { }
            oscillatorRef.current.disconnect()
            oscillatorRef.current = null
        }
        if (lfoRef.current) {
            try { lfoRef.current.stop() } catch { }
            lfoRef.current.disconnect()
            lfoRef.current = null
        }
        if (gainRef.current) {
            gainRef.current.disconnect()
            gainRef.current = null
        }
        setIsPlaying(false)
    }, [])

    const playSound = useCallback(() => {
        if (oscillatorRef.current) return // already playing

        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
            }
            const ctx = audioCtxRef.current
            if (ctx.state === "suspended") ctx.resume()

            // Main oscillator — siren tone
            const osc = ctx.createOscillator()
            osc.type = "sawtooth"
            osc.frequency.value = 600

            // Gain (volume envelope)
            const gain = ctx.createGain()
            gain.gain.value = 0.3

            // LFO to modulate frequency (siren wail effect)
            const lfo = ctx.createOscillator()
            lfo.frequency.value = 4 // 4 Hz wail
            const lfoGain = ctx.createGain()
            lfoGain.gain.value = 300 // frequency swing ±300Hz
            lfo.connect(lfoGain)
            lfoGain.connect(osc.frequency)

            osc.connect(gain)
            gain.connect(ctx.destination)

            osc.start()
            lfo.start()

            oscillatorRef.current = osc
            gainRef.current = gain
            lfoRef.current = lfo
            setIsPlaying(true)
        } catch (e) {
            console.error("Alarm sound error:", e)
        }
    }, [])

    // Poll backend alarm status — only when enabled (i.e. Detection ON).
    // Prevents stale alarm flag from a previous detection session triggering
    // the siren while Detection is OFF.
    useEffect(() => {
        if (!enabled) {
            // Detection OFF → ensure siren stopped and don't poll
            stopSound()
            return
        }

        const poll = async () => {
            try {
                const res = await fetch(`${apiBase}/api/alarm/status`)
                if (res.ok) {
                    const data = await res.json()
                    if (data.active && !oscillatorRef.current) {
                        playSound()
                    } else if (!data.active && oscillatorRef.current) {
                        stopSound()
                    }
                }
            } catch { }
        }

        intervalRef.current = setInterval(poll, 1000)
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            stopSound()
        }
    }, [apiBase, enabled, playSound, stopSound])

    const acknowledge = useCallback(async () => {
        try {
            const token = localStorage.getItem("token")
            await fetch(`${apiBase}/api/alarm/acknowledge`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })
        } catch { }
        stopSound()
    }, [apiBase, stopSound])

    return { isPlaying, playSound, stopSound, acknowledge }
}
