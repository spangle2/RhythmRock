// beat-analyzer.js
self.onmessage = async function(e) {
    const { audioFile } = e.data;
    
    try {
        const audioContext = new OfflineAudioContext(1, 1, 44100);
        const response = await fetch(audioFile);
        const arrayBuffer = await response.arrayBuffer();
        
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        const beats = detectBeats(buffer, buffer.sampleRate);
        
        self.postMessage({ success: true, beats });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};

function detectBeats(buffer, sampleRate) {
    const channelData = buffer.getChannelData(0);
    const beats = [];
    
    const fftSize = 2048;
    const hopSize = Math.floor(sampleRate * 0.02);
    
    const bands = [
        { name: 'bass', min: 20, max: 250, lane: 0 },
        { name: 'low', min: 250, max: 500, lane: 1 },
        { name: 'mid', min: 500, max: 2000, lane: 2 },
        { name: 'high', min: 2000, max: 6000, lane: 3 }
    ];
    
    const bandHistories = bands.map(() => []);
    const historySize = 43;
    const overallEnergyHistory = [];
    
    let processed = 0;
    const total = Math.floor(channelData.length / hopSize);
    
    for (let i = 0; i <= channelData.length - fftSize; i += hopSize) {
        // Send progress updates every 5%
        if (processed % Math.floor(total / 20) === 0) {
            self.postMessage({ 
                progress: true, 
                percent: Math.round((processed / total) * 100) 
            });
        }
        processed++;
        
        const time = i / sampleRate;
        const signal = channelData.slice(i, i + fftSize);
        
        const windowed = signal.map((s, idx) => {
            const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * idx / (fftSize - 1));
            return s * w;
        });
        
        const spectrum = realFFT(windowed, sampleRate);
        
        let totalEnergy = spectrum.reduce((a, b) => a + b, 0);
        overallEnergyHistory.push(totalEnergy);
        if (overallEnergyHistory.length > historySize * 2) {
            overallEnergyHistory.shift();
        }
        
        let intensity = 1.0;
        if (overallEnergyHistory.length >= historySize) {
            const recentAvg = overallEnergyHistory.slice(-historySize).reduce((a, b) => a + b, 0) / historySize;
            const overallAvg = overallEnergyHistory.reduce((a, b) => a + b, 0) / overallEnergyHistory.length;
            intensity = Math.min(3.0, Math.max(0.5, recentAvg / overallAvg));
        }
        
        bands.forEach((band, bandIdx) => {
            const minBin = Math.floor(band.min * fftSize / sampleRate);
            const maxBin = Math.floor(band.max * fftSize / sampleRate);
            
            let energy = 0;
            for (let bin = minBin; bin < maxBin && bin < spectrum.length; bin++) {
                energy += spectrum[bin];
            }
            energy /= (maxBin - minBin);
            
            const history = bandHistories[bandIdx];
            history.push(energy);
            if (history.length > historySize) {
                history.shift();
            }
            
            if (history.length >= 2) {
                const prevEnergy = history[history.length - 2];
                const flux = Math.max(0, energy - prevEnergy);
                
                if (history.length >= historySize) {
                    const mean = history.reduce((a, b) => a + b, 0) / history.length;
                    const variance = history.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / history.length;
                    
                    const baseThreshold = 2.5;
                    const intensityAdjustment = intensity > 1.3 ? (2.0 - (intensity - 1.3)) : baseThreshold;
                    const threshold = mean + Math.sqrt(variance) * Math.max(1.5, intensityAdjustment);
                    
                    if (energy > threshold && flux > mean * 0.5) {
                        const maxSimultaneous = intensity > 1.5 ? 2 : 1;
                        const minGap = intensity > 1.5 ? 0.2 : 0.3;
                        
                        const lastInLane = beats.filter(b => b.lane === band.lane).pop();
                        const recentInAnyLane = beats.filter(b => Math.abs(b.time - time) < 0.15);
                        
                        if (recentInAnyLane.length < maxSimultaneous) {
                            if (!lastInLane || time - lastInLane.time > minGap) {
                                beats.push({ 
                                    time, 
                                    lane: band.lane, 
                                    id: beats.length, 
                                    hit: false,
                                    energy: energy,
                                    intensity: intensity
                                });
                            }
                        }
                    }
                }
            }
        });
    }
    
    return beats;
}

function realFFT(signal, sampleRate) {
    const n = signal.length;
    const spectrum = new Array(Math.floor(n / 2)).fill(0);
    
    const step = 8;
    const timeStep = 8;
    const samples = Math.floor(n / timeStep);
    
    const twoPiOverN = (2 * Math.PI) / n;
    const normFactor = 1 / samples;
    
    for (let k = 0; k < spectrum.length; k += step) {
        let real = 0;
        let imag = 0;
        
        const angleStep = -twoPiOverN * k * timeStep;
        let angle = 0;
        
        for (let t = 0; t < n; t += timeStep) {
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const sample = signal[t];
            
            real += sample * cosA;
            imag += sample * sinA;
            angle += angleStep;
        }
        
        const magnitude = Math.sqrt(real * real + imag * imag) * normFactor;
        spectrum[k] = magnitude;
        
        if (k + step < spectrum.length) {
            for (let j = 1; j < step; j++) {
                spectrum[k + j] = magnitude;
            }
        }
    }
    
    return spectrum;
}
