// beat-analyzer.js
self.onmessage = async function(e) {
    const { audioFile } = e.data;
    
    try {
        const response = await fetch(audioFile);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (AudioContext || webkitAudioContext)();
        
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const beats = detectBeatsSimple(buffer);
        
        self.postMessage({ success: true, beats });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};

function detectBeatsSimple(buffer) {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const beats = [];
    
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
    const hopSize = Math.floor(sampleRate * 0.02); // 20ms hop
    const energyHistory = [];
    const historySize = 20;
    
    let processed = 0;
    const total = Math.floor((channelData.length - windowSize) / hopSize);
    
    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
        // Progress updates
        if (processed % Math.floor(total / 20) === 0) {
            self.postMessage({ 
                progress: true, 
                percent: Math.round((processed / total) * 100) 
            });
        }
        processed++;
        
        const time = i / sampleRate;
        const window = channelData.slice(i, i + windowSize);
        
        // Calculate energy in 4 frequency bands
        const bands = [
            { start: 0, end: Math.floor(windowSize * 0.15), lane: 0 }, // Bass
            { start: Math.floor(windowSize * 0.15), end: Math.floor(windowSize * 0.35), lane: 1 }, // Low-mid
            { start: Math.floor(windowSize * 0.35), end: Math.floor(windowSize * 0.65), lane: 2 }, // Mid
            { start: Math.floor(windowSize * 0.65), end: windowSize, lane: 3 } // High
        ];
        
        bands.forEach(band => {
            let energy = 0;
            for (let j = band.start; j < band.end; j++) {
                energy += window[j] * window[j];
            }
            energy = energy / (band.end - band.start);
            
            // Track energy history for this band
            if (!energyHistory[band.lane]) {
                energyHistory[band.lane] = [];
            }
            
            energyHistory[band.lane].push(energy);
            if (energyHistory[band.lane].length > historySize) {
                energyHistory[band.lane].shift();
            }
            
            // Detect beat when energy spikes above threshold
            if (energyHistory[band.lane].length >= historySize) {
                const avg = energyHistory[band.lane].reduce((a, b) => a + b) / historySize;
                const threshold = avg * 1.5;
                
                if (energy > threshold && energy > 0.001) {
                    // Avoid duplicate notes too close together
                    const lastBeat = beats.filter(b => b.lane === band.lane).pop();
                    if (!lastBeat || time - lastBeat.time > 0.25) {
                        beats.push({
                            time,
                            lane: band.lane,
                            id: beats.length,
                            hit: false
                        });
                    }
                }
            }
        });
    }
    
    return beats;
}
